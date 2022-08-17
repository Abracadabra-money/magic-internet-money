## Fair Value for LP tokens

We calculate the fair value of the reserves in a constant-curve ($F(x,y) = k$) AMM using only $k$ and externally sourced asset prices. This because a malicious actor can temporarily manipulate the reserves cheaply, but not $k$.

### The principle

If the reserve levels $x$ and $y$ AMM trades at the correct price, then the curve will have a tangent line at $F(x, y)$ whose direction corresponds to this price:

$$ \frac{p_x}{p_y} = \frac{F_x(x,y)}{F_y(x,y)}, $$

where $p_x$ and $p_y$ are the asset prices in some third currency, such as ETH or USD, and $F_x$ and $F_y$ are the partial derivatives of $F$. If this equation and $F(x, y) = k$ have a unique solution in terms of the _theoretically correct_ reserve levels $x$ and $y$, then we know the value of all liquidity in the AMM:

$$ p_x \cdot x + p_y \cdot y. $$

### The Solidly stable curve

The Solidly stable curve uses

$$ F(x, y) = x^3y + xy^3 = k. $$

First off, if $p_x = p_y$, then $x = y$ and we are done:

$$ F(x, y) = 2x^4 = k \implies x = y = \sqrt[4]{\frac{k}{2}}. $$

So we assume $p_x \ne p_y$ and define $p := p_x / p_y$, and stipulate that $p < 1$: by symmetry of $F$, we can call the cheaper asset reserve $x$. (This is an implementation detail only; the equations remain valid for all positive $p$). The second equation becomes

$$ p = \frac{F_x(x, y)}{F_y(x, y)} = \frac{3x^2 y + y^3}{x^3 + 3xy^2}. $$

We define $v := y/x$ and obtain

$$
p = \frac{3vx^3 + v^3x^3}{x^3 + 3x^3v^2}
  = \frac{3v + v^3}{1 + v^2}.
$$

This gives us a cubic equation for $v$ in terms of $p$:

$$ f(v) := v^3 - 3pv^2 + 3v - p = 0. $$

[It can be shown](https://en.wikipedia.org/wiki/Cubic_equation#Discriminant) that this equation has exactly one real root. The closed-form solution is numerically unstable, but Newton's method lends itself very well to a Solidity implementation if we start to the "left" of the root:

$$
\begin{aligned}
    v_0 &= 0, \\
v_{n+1} &= v_n - \frac{f(v_n)}{f'(v_n)} \\
        &= v_n - \frac{v_n^3 - 3pv_n^2 + 3v_n - p}
                      {3v_n^2 - 6pv_n + 3} \\
        &= \frac{v_n \cdot (3v_n^2 - 6pv_n + 3) - (v_n^3 - 3pv_n^2 + 3v_n - p)}
                {3v_n^2 - 6pv_n + 3} \\
        &= \frac{3v_n^3 - 6pv_n^2 + 3v_n - v_n^3 + 3pv_n^2 - 3v_n + p}
                {3v_n^2 - 6pv_n + 3} \\
        &= \frac{2v_n^3 - 3pv_n^2 + p}
                {3v_n^2 - 6pv_n + 3}.
\end{aligned}
$$

In both of the following, we use the fact that $0 < p < 1$. The cubic is strictly increasing:

$$
\begin{aligned}
f'(v) &= 3v^2 - 6pv + 3 \\
      &> 3pv^2 - 6pv + 3p \\
      &= 3p(v-1)^2 \ge 0.
\end{aligned}
$$

Since $f(0) = -p < 0$ and $f(p) = 2p - 2p^3 > 0$, the root lies between $0$ and $p$. On the interval between $0$ and the root, the cubic is concave:

$$ f''(v) = 6v - 6p < 0. $$

This is important, because it implies that the iterations in Newton's method always move closer to, but not past, the root. If we use suitable precision, the calculations will not overflow. Or even worsen the guess, unless $p$ is extremely small.

Having found $v$, we use the original curve equation to recover $x$ and $y$:

$$
\begin{aligned}
  x^3y + xy^3 &= k, \\
x^4v + x^4v^3 &= k, \\
            x &= \sqrt[4]{\frac{k}{v + v^3}}, \\
            y &= vx = \sqrt[4]{\frac{v^3k}{1 + v^2}}
\end{aligned}
$$

To avoid having to take a third power of $k$, we can apply the Babylonian square root method twice.


### Error analysis

Unless stated otherwise, we assume all values are 18-digit fixed point.

We take $k$ as exact, even though it isn't: we assume the contract does a sufficiently good job at finding "best" trade sizes that this is not a concern.

Our calculation for $p$ costs us $\log_{10} p_y - \log_{10} p_x$ digits, and this number will be positive by construction. Without formal proof: $v$ is an increasing function of $p$, so if $p$ is an underestimate, so is $v$.

The root-finding method itself allows for exact multiplication; loss of precision is at the division step. If we only stop iterating when we find a fixed point, the final digit may therefore be off by one. If we abort early, the error may be larger, but convergence is good so we assume an error on that order. The relative error is on the order of $1 / (18 + \log_{10} p)$ (and this logarithm is negative).

In any case, $v$ is an underestimate. Assume hat rather than the true value $v$, we are instead working with $(1 - \alpha) v$ for some $\alpha \in (0, 1)$. Consequently, instead of $x$ we obtain $(1 + \beta) x$ for some $\beta > 0$, bounded by:

$$
\begin{aligned}
         (1 + \beta) x &= \sqrt[4]{\frac{k}{(1-\alpha) v + (1-\alpha)^3 v^3}} \\
                       &< \sqrt[4]{\frac{k}{(1 - 3\alpha) (v + v^3)}} \\
                       &= \frac{1}{\sqrt[4]{1 - 3\alpha}} x \\
                       &< \frac{1}{1 - 3\alpha} x \\
        \implies \beta &< 3\alpha + 9\alpha^2 + 27\alpha^3 + \cdots
\end{aligned}
$$

which for any reasonable number is very close to $3 \alpha$. In short: if $v$ is low by as much as one percent, then $x$ is high by at most three percent. (One, in fact; outright ignoring the fourth root is too wide an estimate).  This also shows that it is relatively safe to calculate $y$ as $vx$, rather than the direct formula.

Calculating $v^3$ will cost us some precision as well, but we have some wiggle room to scale $k$ so this can be limited to one (fixed-point) multiplication's worth. Furthermore, if $v$ so small that these errors are a problem, the contribution of the entire $v^3$ term will be negligible to begin with.

We've used loose bounds in this estimation, but it remains true that $y$ is underestimated less than $x$ is overestimated, in relative terms.

To prevent exploitability when one of the assets drops significantly, we approximate the value function linearly beyond a cutoff ratio. Without proof: this will alway result in a lower number, and almost always underestimates total value as a function of $p$. 

Dramatically so, as $p$ gets much closer to zero, but one would have to have decided to enter into a new loan in those conditions in the first place to be disadvantaged by that.

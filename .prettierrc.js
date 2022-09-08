module.exports = {
  overrides: [
    {
      files: "*.ts",
      options: {
        printWidth: 80,
        semi: true,
        trailingComma: "es5",
      },
    },
    {
      files: "*.sol",
      options: {
        printWidth: 80,
        tabWidth: 4,
        useTabs: false,
        singleQuote: false,
        bracketSpacing: false,
        explicitTypes: "always",
      },
    },
  ],
};

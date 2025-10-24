module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  rules: {
    "import/no-restricted-paths": [
      "error",
      {
        zones: [
          {
            target: ["apps/saas-api", "apps/saas-web"],
            from: ["apps/agent-api", "apps/agent-ui"],
            message: "SaaS não pode importar código do Agente"
          },
          {
            target: ["apps/agent-api", "apps/agent-ui"],
            from: ["apps/saas-api", "apps/saas-web"],
            message: "Agente não pode importar código do SaaS"
          }
        ]
      }
    ]
  }
};

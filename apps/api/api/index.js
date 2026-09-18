const serverlessModule = require("../dist/serverless");
const handler = serverlessModule.default || serverlessModule;

module.exports = (req, res) => {
    return handler(req, res);
};

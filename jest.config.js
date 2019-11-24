process.env.LOGGING_LEVEL = "error";
module.exports = {
  setupFiles: ["./test/setup.js"],
  preset: "ts-jest",
  testEnvironment: "node",
  testPathIgnorePatterns: ["<rootDir>/node_modules/", "<rootDir>/dist/"]
};

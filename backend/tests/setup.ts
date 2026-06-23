// Test preamble (bunfig.toml `preload`, runs before any test file imports). Forces the store's in-memory
// fallback and clears the optional-infra env so unit tests are hermetic — no Mongo, no Redis, regardless of
// what the developer has running locally.
process.env.QINIT_NO_DB = "1";

delete process.env.REDIS_URL;
delete process.env.MONGODB_URI;

// workerPool.js - Updated
const { StaticPool } = require("node-worker-threads-pool");

exports.createWorkerPool = (workerPath, size) => {
  console.log(`Creating worker pool with ${size} workers at ${workerPath}`);

  // Create a static pool of workers
  const pool = new StaticPool({
    size,
    task: workerPath,
  });

  // Wrap the pool's execute method in a promise
  const runTask = async (data) => {
    try {
      console.log("Submitting task to worker pool");
      const result = await pool.exec(data);
      console.log("Task completed by worker pool");
      return result;
    } catch (error) {
      console.error("Worker pool error:", error);
      throw error;
    }
  };

  return {
    runTask,
    pool,
  };
};

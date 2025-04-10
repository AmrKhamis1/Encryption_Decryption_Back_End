// workerPool.js - Custom Worker Pool Implementation for Node.js
const { Worker } = require("worker_threads");
const path = require("path");

/**
 * Creates a pool of Worker threads
 * @param {string} workerPath - Path to the worker script
 * @param {number} size - Number of workers in the pool
 * @returns {Object} - Pool interface with runTask method
 */
exports.createWorkerPool = (workerPath, size) => {
  console.log(`Creating worker pool with ${size} workers at ${workerPath}`);

  // Array to hold our worker instances
  const workers = [];
  // Queue for pending tasks
  const taskQueue = [];
  // Track which workers are busy
  const busyWorkers = new Set();

  // Initialize workers
  for (let i = 0; i < size; i++) {
    const worker = new Worker(workerPath);
    workers.push(worker);

    // Set up message and error handlers
    worker.on("message", createMessageHandler(worker, i));
    worker.on("error", (error) => {
      console.error(`Worker ${i} error:`, error);
      // Mark worker as available despite error
      busyWorkers.delete(worker);
      processQueue();
    });
  }

  // Creates a message handler for a specific worker
  function createMessageHandler(worker, id) {
    return function (result) {
      console.log(`Worker ${id} completed task`);

      // Resolve the promise associated with this worker
      if (worker._resolve) {
        worker._resolve(result);
        worker._resolve = null;
        worker._reject = null;
      }

      // Mark worker as available
      busyWorkers.delete(worker);

      // Process next task in queue if any
      processQueue();
    };
  }

  // Process the next task in queue if a worker is available
  function processQueue() {
    if (taskQueue.length === 0) return;

    // Find an available worker
    for (const worker of workers) {
      if (!busyWorkers.has(worker)) {
        const nextTask = taskQueue.shift();
        executeOnWorker(
          worker,
          nextTask.data,
          nextTask.resolve,
          nextTask.reject
        );
        break;
      }
    }
  }

  // Execute a task on a specific worker
  function executeOnWorker(worker, data, resolve, reject) {
    busyWorkers.add(worker);

    // Store resolve/reject callbacks with the worker
    worker._resolve = resolve;
    worker._reject = reject;

    // Send the task to the worker
    worker.postMessage(data);
    console.log("Task sent to worker");
  }

  // Main method to run a task
  const runTask = (data) => {
    return new Promise((resolve, reject) => {
      console.log("Submitting task to worker pool");

      // Find an available worker or queue the task
      const availableWorker = workers.find(
        (worker) => !busyWorkers.has(worker)
      );

      if (availableWorker) {
        executeOnWorker(availableWorker, data, resolve, reject);
      } else {
        // Queue the task if all workers are busy
        taskQueue.push({ data, resolve, reject });
        console.log("All workers busy, task queued");
      }
    });
  };

  // Method to terminate all workers in the pool
  const terminate = () => {
    console.log("Terminating worker pool");
    for (const worker of workers) {
      worker.terminate();
    }
  };

  return {
    runTask,
    terminate,
    get size() {
      return size;
    },
    get pending() {
      return taskQueue.length;
    },
    get active() {
      return busyWorkers.size;
    },
  };
};

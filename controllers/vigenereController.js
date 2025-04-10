// controller logic for Vigenère API endpoints
const {
  decryptWithKey,
  countRecognizedWords,
} = require("../utils/vigenereLogic.js");
const { createWorkerPool } = require("../utils/workerPool.js");
const fs = require("fs");
const path = require("path");

// load dictionary
const dictionary = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/Words.json"), "utf8")
).commonWords.reduce((dict, word, index) => {
  // calculate weight based on word frequency and length
  let weight = 1.0;
  if (word.length > 2) weight += (word.length - 2) * 0.3;
  if (index < 500) weight += 0.8;
  dict[word] = weight;
  return dict;
}, {});

// load common keys
const vkData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "../data/vk.json"), "utf8")
);

const WORKER_COUNT = Math.max(4, require("os").cpus().length - 1);
const workerPath = path.resolve(__dirname, "../workers/vigenereWorker.js");
const workerPool = createWorkerPool(workerPath, WORKER_COUNT);

let activeTasks = 0;
let completedTasks = 0;
let startTime = Date.now();

/**
 ****************************  decrypt text with a known key
 */
exports.decryptWithKey = async (req, res) => {
  try {
    const { ciphertext, key } = req.body;

    if (!ciphertext) {
      return res.status(400).json({ error: "Ciphertext is required" });
    }

    if (!key) {
      return res.status(400).json({ error: "Key is required" });
    }

    // decrypt the text
    const decryptedText = decryptWithKey(ciphertext, key);

    // calculate word stats
    const wordStats = countRecognizedWords(decryptedText, dictionary);

    return res.json({
      decryptedText,
      wordStats,
      key,
    });
  } catch (error) {
    console.error("Decryption error:", error);
    return res.status(500).json({ error: "Error during decryption" });
  }
};

/**
 *************** crack vigenere cipher without knowing the key
 */
exports.crackCipher = async (req, res) => {
  try {
    const {
      ciphertext,
      maxKeyLength = 10,
      targetRecognition = 90,
      maxIterations = 35,
      useBruteForce = false,
    } = req.body;

    if (!ciphertext) {
      return res.status(400).json({ error: "Ciphertext is required" });
    }

    // Increment active tasks
    activeTasks++;
    console.log("Starting worker task");

    // use worker for CPU-intensive operation
    const result = await workerPool.runTask({
      ciphertext,
      maxKeyLength: parseInt(maxKeyLength),
      targetRecognition: parseInt(targetRecognition),
      maxIterations: parseInt(maxIterations),
      useBruteForce: useBruteForce,
      knownKeys: useBruteForce ? vkData.keys : [],
      dictionary,
    });
    console.log("Worker pool results:", result);

    // decrement active tasks and increment completed tasks
    activeTasks--;
    completedTasks++;

    // If no results were found
    if (!result.topResults || result.topResults.length === 0) {
      return res.json({
        message: "No viable solutions found",
        error: "Could not find any viable keys with the given parameters",
      });
    }

    // prepare the response
    const response = {
      topResults: result.topResults,
      fullDecryption: result.fullDecryption,
      message: "Cipher cracked successfully",
    };

    return res.json(response);
  } catch (error) {
    // decrement active tasks on error
    activeTasks--;

    console.error("Cipher cracking error:", error);
    return res
      .status(500)
      .json({ error: "Error during cipher cracking", message: error.message });
  }
};

/**
 ********************* server status
 */
exports.getStatus = (req, res) => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);

  return res.json({
    status: "operational",
    workers: WORKER_COUNT,
    activeTasks,
    completedTasks,
    uptime: `${Math.floor(uptime / 60)} minutes, ${uptime % 60} seconds`,
    activeWorkers: workerPool.active,
    pendingTasks: workerPool.pending,
  });
};

process.on("exit", () => {
  if (workerPool.terminate) {
    workerPool.terminate();
  }
});

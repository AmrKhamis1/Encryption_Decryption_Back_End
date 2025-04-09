const { parentPort, workerData } = require("worker_threads");
const vigenereLogic = require("../utils/vigenereLogic");

// If using as part of a StaticPool (which you are)
if (parentPort) {
  // Handle the task directly from the main thread
  parentPort.on("message", (task) => {
    console.log("[WORKER] Received task:", task.ciphertext);
    try {
      const result = processTask(task);
      parentPort.postMessage(result);
      console.log("[WORKER] Task completed and sent");
    } catch (error) {
      console.error("[WORKER ERROR]", error.stack || error);
      parentPort.postMessage({
        error: true,
        message: error.message,
      });
    }
  });
}

// Separately export the function for StaticPool
module.exports = function (task) {
  console.log("[WORKER-POOL] Received task:", task.ciphertext);
  try {
    return processTask(task);
  } catch (error) {
    console.error("[WORKER-POOL ERROR]", error.stack || error);
    return {
      error: true,
      message: error.message,
    };
  }
};

// Shared processing function
function processTask(task) {
  const {
    ciphertext,
    maxKeyLength,
    targetRecognition,
    maxIterations,
    useBruteForce,
    knownKeys,
    dictionary,
  } = task;

  let result;
  if (useBruteForce && knownKeys && knownKeys.length > 0) {
    console.log("[WORKER] Running bruteForceCrack...");
    result = bruteForceCrack(
      ciphertext,
      knownKeys,
      dictionary,
      targetRecognition,
      maxIterations
    );
  } else {
    console.log("[WORKER] Running geneticCrack...");
    result = cryptanalysisCrack(
      ciphertext,
      maxKeyLength,
      dictionary,
      targetRecognition,
      maxIterations
    );
  }

  console.log("[WORKER] Result calculated:", result.method);
  return result;
}
/**
 * Brute force approach using known common keys
 * @param {string} ciphertext - Encrypted text
 * @param {Array<string>} keys - Known keys to try
 * @param {Object} dictionary - Dictionary for word recognition
 * @param {number} targetRecognition - Target word recognition percentage
 * @param {number} maxIterations - Maximum refinement iterations
 * @returns {Object} - Results of cracking attempt
 */
function bruteForceCrack(
  ciphertext,
  keys,
  dictionary,
  targetRecognition,
  maxIterations
) {
  const results = [];

  // Try each known key
  for (const key of keys) {
    const decrypted = vigenereLogic.decryptWithKey(ciphertext, key);
    const wordStats = vigenereLogic.countRecognizedWords(decrypted, dictionary);

    // Calculate additional metrics for better evaluation
    const frequencies = vigenereLogic.getFrequencies(decrypted);
    const chiSquared = vigenereLogic.calculateChiSquared(frequencies);

    // Calculate composite score
    const compositeScore =
      wordStats.percentage * 0.7 +
      wordStats.weightedScore * 15 -
      chiSquared * 0.2;

    results.push({
      key,
      keyLength: key.length,
      wordStats,
      chiSquared,
      compositeScore,
      preview: decrypted.substring(0, 100),
    });
  }

  // Sort by composite score (higher is better)
  results.sort((a, b) => b.compositeScore - a.compositeScore);

  // Get top 5 results
  const topResults = results.slice(0, 5);

  // Get full decryption of best result
  const fullDecryption =
    topResults.length > 0
      ? vigenereLogic.decryptWithKey(ciphertext, topResults[0].key)
      : "";

  // Try to refine the best key if it's not good enough
  if (
    topResults.length > 0 &&
    topResults[0].wordStats.percentage < targetRecognition
  ) {
    const bestKey = topResults[0].key;
    const refinementResult = vigenereLogic.refineKey(
      bestKey,
      ciphertext,
      dictionary,
      targetRecognition,
      maxIterations
    );

    // If refinement improved the key, add it to the results
    if (
      refinementResult.improved &&
      refinementResult.wordStats.percentage > topResults[0].wordStats.percentage
    ) {
      const refinedDecryption = vigenereLogic.decryptWithKey(
        ciphertext,
        refinementResult.finalKey
      );

      // Add the refined result as the new top result
      topResults.unshift({
        key: refinementResult.finalKey,
        keyLength: refinementResult.finalKey.length,
        wordStats: refinementResult.wordStats,
        improved: true,
        iterations: refinementResult.iterations,
        compositeScore:
          refinementResult.wordStats.percentage * 0.7 +
          refinementResult.wordStats.weightedScore * 15,
        preview: refinedDecryption.substring(0, 100),
      });

      // Update full decryption with the refined result
      return {
        topResults,
        fullDecryption: refinedDecryption,
        method: "brute-force-with-refinement",
      };
    }
  }

  return {
    topResults,
    fullDecryption,
    method: "brute-force",
  };
}

/**
 * Cryptanalysis approach to crack the cipher
 * @param {string} ciphertext - Encrypted text
 * @param {number} maxKeyLength - Maximum key length to try
 * @param {Object} dictionary - Dictionary for word recognition
 * @param {number} targetRecognition - Target word recognition percentage
 * @param {number} maxIterations - Maximum refinement iterations
 * @returns {Object} - Results of cracking attempt
 */
function cryptanalysisCrack(
  ciphertext,
  maxKeyLength,
  dictionary,
  targetRecognition,
  maxIterations
) {
  // Clean the ciphertext for analysis
  const cleanText = ciphertext.toUpperCase().replace(/[^A-Z]/g, "");

  if (cleanText.length < 20) {
    throw new Error("Ciphertext too short for reliable analysis");
  }

  // Step 1: Find the most likely key length using Index of Coincidence
  const keyLengthScores = [];
  for (let length = 1; length <= maxKeyLength; length++) {
    const sequences = vigenereLogic.getSequences(ciphertext, length);
    let totalIC = 0;

    // Calculate average IC for all sequences of this length
    for (const seq of sequences) {
      totalIC += vigenereLogic.calculateIC(seq);
    }

    const avgIC = totalIC / sequences.length;
    keyLengthScores.push({ length, avgIC });
  }

  // Sort by IC score (higher is better)
  keyLengthScores.sort((a, b) => b.avgIC - a.avgIC);

  // Take top 3 most likely key lengths
  const likelyKeyLengths = keyLengthScores
    .slice(0, 3)
    .map((item) => item.length);

  let bestResult = null;

  // Try each likely key length
  for (const keyLength of likelyKeyLengths) {
    // Step 2: Split text into sequences by key position
    const sequences = vigenereLogic.getSequences(ciphertext, keyLength);

    // Step 3: Find best shifts for each position
    const shiftOptions = sequences.map(
      (seq) => vigenereLogic.findBestShifts(seq, 3) // Get top 3 shifts for each position
    );

    // Step 4: Generate potential keys from shift combinations
    const potentialKeys = vigenereLogic.generateKeys(shiftOptions);

    // Step 5: Test each potential key
    const keyResults = [];
    for (const key of potentialKeys) {
      const quality = vigenereLogic.rateKeyQuality(key, ciphertext, dictionary);
      keyResults.push(quality);
    }

    // Sort by composite score (higher is better)
    keyResults.sort((a, b) => b.compositeScore - a.compositeScore);

    // Keep best result
    if (keyResults.length > 0) {
      const bestKeyForLength = keyResults[0];
      if (
        !bestResult ||
        bestKeyForLength.compositeScore > bestResult.compositeScore
      ) {
        bestResult = bestKeyForLength;
      }
    }
  }

  // If no result found
  if (!bestResult) {
    return {
      topResults: [],
      message: "Could not find a viable key",
      method: "cryptanalysis",
    };
  }

  // Try to refine the best key
  const refinementResult = vigenereLogic.refineKey(
    bestResult.key,
    ciphertext,
    dictionary,
    targetRecognition,
    maxIterations
  );

  // Create the top results array
  const topResults = [
    {
      key: refinementResult.finalKey,
      keyLength: refinementResult.finalKey.length,
      wordStats: refinementResult.wordStats,
      chiSquared: bestResult.chiSquared,
      compositeScore:
        refinementResult.wordStats.percentage * 0.7 +
        refinementResult.wordStats.weightedScore * 15 -
        bestResult.chiSquared * 0.2,
      improved: refinementResult.improved,
      iterations: refinementResult.iterations,
      preview: refinementResult.decrypted.substring(0, 100),
    },
  ];

  // Add original result if different from refined
  if (refinementResult.finalKey !== bestResult.key) {
    topResults.push({
      key: bestResult.key,
      keyLength: bestResult.key.length,
      wordStats: bestResult.wordStats,
      chiSquared: bestResult.chiSquared,
      compositeScore: bestResult.compositeScore,
      preview: bestResult.decrypted.substring(0, 100),
    });
  }

  return {
    topResults,
    fullDecryption: refinementResult.decrypted,
    method: "cryptanalysis",
  };
}

const { parentPort } = require("worker_threads");
const vigenereLogic = require("../utils/vigenereLogic");

// Setup message handler for worker_threads
parentPort.on("message", async (task) => {
  console.log("[WORKER] Received task:", task.ciphertext);

  try {
    const result = await processTask(task);
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

// Shared processing function
async function processTask(task) {
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
    result = await bruteForceCrack(
      ciphertext,
      knownKeys,
      dictionary,
      targetRecognition,
      maxIterations
    );
  } else {
    console.log("[WORKER] Running geneticCrack...");
    result = await cryptanalysisCrack(
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

function bruteForceCrack(
  ciphertext,
  keys,
  dictionary,
  targetRecognition,
  maxIterations
) {
  const results = [];

  // try each known key
  for (const key of keys) {
    const decrypted = vigenereLogic.decryptWithKey(ciphertext, key);
    const wordStats = vigenereLogic.countRecognizedWords(decrypted, dictionary);

    // calculate additional metrics for better evaluation
    const frequencies = vigenereLogic.getFrequencies(decrypted);
    const chiSquared = vigenereLogic.calculateChiSquared(frequencies);

    // calculate composite score
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

  // sort by composite score (higher is better)
  results.sort((a, b) => b.compositeScore - a.compositeScore);

  // get top 5 results
  const topResults = results.slice(0, 5);

  // get full decryption of best result
  const fullDecryption =
    topResults.length > 0
      ? vigenereLogic.decryptWithKey(ciphertext, topResults[0].key)
      : "";

  // try to refine the best key if it's not good enough
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

      // add the refined result as the new top result
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

      // update full decryption with the refined result
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

// ******************************   this function used only when brute force is false   ******************************
function cryptanalysisCrack(
  ciphertext,
  maxKeyLength,
  dictionary,
  targetRecognition,
  maxIterations
) {
  // clean the ciphertext for analysis
  const cleanText = ciphertext.toUpperCase().replace(/[^A-Z]/g, "");

  if (cleanText.length < 20) {
    throw new Error("Ciphertext too short for reliable analysis");
  }

  // find the most likely key length using Index of Coincidence
  const keyLengthScores = [];
  for (let length = 1; length <= maxKeyLength; length++) {
    const sequences = vigenereLogic.getSequences(ciphertext, length);
    let totalIC = 0;

    // calculate average IC for all sequences of this length
    for (const seq of sequences) {
      totalIC += vigenereLogic.calculateIC(seq);
    }

    const avgIC = totalIC / sequences.length;
    keyLengthScores.push({ length, avgIC });
  }

  // sort by IC score (higher is better)
  keyLengthScores.sort((a, b) => b.avgIC - a.avgIC);

  // take top 3 most likely key lengths
  const likelyKeyLengths = keyLengthScores
    .slice(0, 3)
    .map((item) => item.length);

  let bestResult = null;

  // try each likely key length
  for (const keyLength of likelyKeyLengths) {
    const sequences = vigenereLogic.getSequences(ciphertext, keyLength);

    const shiftOptions = sequences.map((seq) =>
      vigenereLogic.findBestShifts(seq, 3)
    );

    const potentialKeys = vigenereLogic.generateKeys(shiftOptions);

    const keyResults = [];
    for (const key of potentialKeys) {
      const quality = vigenereLogic.rateKeyQuality(key, ciphertext, dictionary);
      keyResults.push(quality);
    }

    // sort by composite score (higher is better)
    keyResults.sort((a, b) => b.compositeScore - a.compositeScore);

    // keep best result
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

  // If there is no result found
  if (!bestResult) {
    return {
      topResults: [],
      message: "Could not find a viable key",
      method: "cryptanalysis",
    };
  }

  // try to refine the best key
  const refinementResult = vigenereLogic.refineKey(
    bestResult.key,
    ciphertext,
    dictionary,
    targetRecognition,
    maxIterations
  );

  // create the top results array
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

  // add original result if different from refined
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

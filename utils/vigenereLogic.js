// this is the Core vigenere cipher operations

// English letter frequencies (most common to least common)
const ENGLISH_FREQUENCIES = {
  E: 0.1202,
  T: 0.091,
  A: 0.0812,
  O: 0.0768,
  I: 0.0731,
  N: 0.0695,
  S: 0.0628,
  R: 0.0602,
  H: 0.0592,
  D: 0.0432,
  L: 0.0398,
  U: 0.0288,
  C: 0.0271,
  M: 0.0261,
  F: 0.023,
  Y: 0.0211,
  W: 0.0209,
  G: 0.0203,
  P: 0.0182,
  B: 0.0149,
  V: 0.0111,
  K: 0.0069,
  X: 0.0017,
  Q: 0.0011,
  J: 0.001,
  Z: 0.0007,
};

// calculate Index of Coincidence (helps determine key length)
const calculateIC = (text) => {
  const cleanText = text.toUpperCase().replace(/[^A-Z]/g, "");
  const frequencies = {};
  const length = cleanText.length;

  // count each letter
  for (let i = 0; i < length; i++) {
    frequencies[cleanText[i]] = (frequencies[cleanText[i]] || 0) + 1;
  }

  // calculate IC value
  let sum = 0;
  for (const letter in frequencies) {
    const count = frequencies[letter];
    sum += count * (count - 1);
  }

  if (length <= 1) return 0;
  return sum / (length * (length - 1));
};

// calculate frequency of each letter in the text
const getFrequencies = (text) => {
  const cleanText = text.toUpperCase();
  const frequencies = {};
  let total = 0;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    if (/[A-Z]/.test(char)) {
      frequencies[char] = (frequencies[char] || 0) + 1;
      total++;
    }
  }

  // convert counts to percentages
  for (const letter in frequencies) {
    frequencies[letter] /= total;
  }

  return frequencies;
};

// compare letter frequencies to english using Chi-squared test
const calculateChiSquared = (frequencies) => {
  let chiSquared = 0;
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(65 + i);
    const observed = frequencies[letter] || 0;
    const expected = ENGLISH_FREQUENCIES[letter] || 0;
    if (expected > 0) {
      chiSquared += Math.pow(observed - expected, 2) / expected;
    }
  }
  return chiSquared;
};

// split text into sequences based on key length
const getSequences = (text, keyLength) => {
  // create array to hold each sequence
  const sequences = Array(keyLength)
    .fill()
    .map(() => "");
  let j = 0;

  // distribute letters to sequences
  for (let i = 0; i < text.length; i++) {
    if (/[A-Z]/i.test(text[i])) {
      const position = j % keyLength;
      sequences[position] += text[i];
      j++;
    }
  }

  return sequences;
};

// find possible shifts for each sequence with improved frequency analysis
const findBestShifts = (sequence, numOptions = 8) => {
  const results = [];

  // try all 26 possible shifts
  for (let shift = 0; shift < 26; shift++) {
    let decrypted = "";
    // apply this shift to each character
    for (let i = 0; i < sequence.length; i++) {
      const char = sequence[i];
      const code = char.charCodeAt(0);

      if (code >= 65 && code <= 90) {
        // ppercase
        decrypted += String.fromCharCode(((code - 65 - shift + 26) % 26) + 65);
      } else if (code >= 97 && code <= 122) {
        // lowercase
        decrypted += String.fromCharCode(((code - 97 - shift + 26) % 26) + 97);
      } else {
        decrypted += char;
      }
    }

    // calculate how similar to English using multiple metrics
    const frequencies = getFrequencies(decrypted);
    const chiSquared = calculateChiSquared(frequencies);

    // calculate letter distribution score
    let distributionScore = 0;
    for (const letter in ENGLISH_FREQUENCIES) {
      if (frequencies[letter]) {
        distributionScore +=
          frequencies[letter] * ENGLISH_FREQUENCIES[letter] * 100;
      }
    }

    const combinedScore = chiSquared - distributionScore * 0.5;
    results.push({ shift, chiSquared, distributionScore, combinedScore });
  }

  // return top shifts (sorted by combined metric)
  results.sort((a, b) => a.combinedScore - b.combinedScore);
  return results.slice(0, numOptions).map((r) => r.shift);
};

// convert shifts to a key string
const shiftsToKey = (shifts) => {
  return shifts.map((shift) => String.fromCharCode(shift + 65)).join("");
};

// decrypt text with a given key
const decryptWithKey = (text, key) => {
  if (!key) return text;

  const upperKey = key.toUpperCase();
  let result = "";
  let keyIndex = 0;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char.match(/[a-z]/i)) {
      const isUpperCase = char === char.toUpperCase();
      // convert to 0-25 range
      const charCode = char.toUpperCase().charCodeAt(0) - 65;
      const keyChar = upperKey[keyIndex % upperKey.length];
      const keyCode = keyChar.charCodeAt(0) - 65;

      // apply vigenere decryption formula
      let decryptedCode = (charCode - keyCode + 26) % 26;
      let decryptedChar = String.fromCharCode(decryptedCode + 65);

      if (!isUpperCase) {
        decryptedChar = decryptedChar.toLowerCase();
      }

      result += decryptedChar;
      keyIndex++;
    } else {
      // this is for keeping the non alphapitical char
      result += char;
    }
  }

  return result;
};

// count recognized English words in text
const countRecognizedWords = (text, dictionary) => {
  const words = text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 0);

  let recognizedCount = 0;
  let totalWeight = 0;

  for (const word of words) {
    if (word.length >= 2) {
      const wordWeight = dictionary[word];
      if (wordWeight) {
        recognizedCount++;
        totalWeight += wordWeight;
      }
    }
  }

  const percentage =
    words.length > 0 ? (recognizedCount / words.length) * 100 : 0;
  const weightedScore = words.length > 0 ? totalWeight / words.length : 0;

  return {
    count: recognizedCount,
    total: words.length,
    percentage,
    weightedScore,
  };
};

// try variations of a key to improve it with higher target percentage
const refineKey = (
  initialKey,
  ciphertext,
  dictionary,
  targetPercentage,
  maxIters,
  progressCallback
) => {
  let bestKey = initialKey;
  let bestDecrypted = decryptWithKey(ciphertext, bestKey);
  let bestWordStats = countRecognizedWords(bestDecrypted, dictionary);
  let bestScore = bestWordStats.percentage;
  let iterations = 0;
  let improved = false;
  let lastImprovedIteration = 0;

  // this continue refining until we reach target or max iterations
  while (
    (bestScore < targetPercentage && iterations < maxIters) ||
    (iterations < maxIters && iterations - lastImprovedIteration < 10)
  ) {
    iterations++;
    console.log(iterations);
    if (progressCallback) {
      progressCallback(
        `Refining key (iteration ${iterations}/${maxIters}). Current recognition: ${bestScore.toFixed(
          2
        )}%`
      );
    }

    let foundBetter = false;

    const stagnating = iterations - lastImprovedIteration > 5;

    // changing one letter at a time
    for (let pos = 0; pos < bestKey.length; pos++) {
      // random shuffling of shifts to prevent getting stuck in local maxima
      const shiftOrder = Array.from({ length: 26 }, (_, i) => i);
      for (let i = shiftOrder.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shiftOrder[i], shiftOrder[j]] = [shiftOrder[j], shiftOrder[i]];
      }

      for (const shift of shiftOrder) {
        if (bestKey.charCodeAt(pos) - 65 === shift) continue;

        const newKey =
          bestKey.substring(0, pos) +
          String.fromCharCode(65 + shift) +
          bestKey.substring(pos + 1);

        //  key test
        const decrypted = decryptWithKey(ciphertext, newKey);
        const wordStats = countRecognizedWords(decrypted, dictionary);

        if (wordStats.percentage > bestScore) {
          bestKey = newKey;
          bestScore = wordStats.percentage;
          bestDecrypted = decrypted;
          bestWordStats = wordStats;
          foundBetter = true;
          improved = true;
          lastImprovedIteration = iterations;
          break;
        }
      }
      if (foundBetter) break;

      // If stagnating, try swapping adjacent letters
      if (stagnating && pos < bestKey.length - 1) {
        const swappedKey =
          bestKey.substring(0, pos) +
          bestKey.charAt(pos + 1) +
          bestKey.charAt(pos) +
          bestKey.substring(pos + 2);

        const decrypted = decryptWithKey(ciphertext, swappedKey);
        const wordStats = countRecognizedWords(decrypted, dictionary);

        if (wordStats.percentage > bestScore) {
          bestKey = swappedKey;
          bestScore = wordStats.percentage;
          bestDecrypted = decrypted;
          bestWordStats = wordStats;
          foundBetter = true;
          improved = true;
          lastImprovedIteration = iterations;
          break;
        }
      }
    }

    // If stuck, try random changes
    if (!foundBetter) {
      const changeCount = Math.min(
        Math.floor((iterations - lastImprovedIteration) / 3) + 1,
        Math.floor(bestKey.length / 2)
      );

      let newKey = bestKey;
      for (let i = 0; i < changeCount; i++) {
        const pos = Math.floor(Math.random() * newKey.length);
        const randomShift = Math.floor(Math.random() * 26);
        newKey =
          newKey.substring(0, pos) +
          String.fromCharCode(65 + randomShift) +
          newKey.substring(pos + 1);
      }

      const decrypted = decryptWithKey(ciphertext, newKey);
      const wordStats = countRecognizedWords(decrypted, dictionary);

      if (wordStats.percentage > bestScore) {
        bestKey = newKey;
        bestScore = wordStats.percentage;
        bestDecrypted = decrypted;
        bestWordStats = wordStats;
        improved = true;
        lastImprovedIteration = iterations;
      }
    }

    // If we reach the target, break
    if (bestScore >= targetPercentage) {
      break;
    }
  }

  return {
    finalKey: bestKey,
    improved,
    iterations,
    wordStats: bestWordStats,
    decrypted: bestDecrypted,
  };
};

// generate possible keys from shift options
const generateKeys = (shiftOptions) => {
  // Start with first letter options
  let combinations = shiftOptions[0].map((shift) => [shift]);

  for (let i = 1; i < shiftOptions.length; i++) {
    const newCombinations = [];
    for (const combo of combinations) {
      for (const shift of shiftOptions[i]) {
        newCombinations.push([...combo, shift]);
      }
    }
    combinations = newCombinations;

    // limit number of combinations to prevent overload
    if (combinations.length > 5000) {
      combinations = combinations.slice(0, 5000);
    }
  }

  // convert shift arrays to key strings
  return combinations.map((shifts) => shiftsToKey(shifts));
};

// rate the quality of a key based on multiple factors
const rateKeyQuality = (key, ciphertext, dictionary) => {
  const decrypted = decryptWithKey(ciphertext, key);
  const wordStats = countRecognizedWords(decrypted, dictionary);

  // get letter distribution of decrypted text
  const frequencies = getFrequencies(decrypted);
  const chiSquared = calculateChiSquared(frequencies);

  // calculate composite score
  const compositeScore =
    wordStats.percentage * 0.7 +
    wordStats.weightedScore * 15 -
    chiSquared * 0.2;

  return {
    key,
    decrypted,
    wordStats,
    chiSquared,
    compositeScore,
  };
};

// exports
module.exports = {
  calculateIC,
  getFrequencies,
  calculateChiSquared,
  getSequences,
  findBestShifts,
  shiftsToKey,
  decryptWithKey,
  countRecognizedWords,
  refineKey,
  generateKeys,
  rateKeyQuality,
  ENGLISH_FREQUENCIES,
};

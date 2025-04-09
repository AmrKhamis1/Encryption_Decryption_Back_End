// API routes for Vigenère cipher operations
const express = require("express");
const router = express.Router();
const vigenereController = require("../controllers/vigenereController");

/**
 * @route   POST /api/vigenere/decrypt
 * @desc    Decrypt text with a known key
 * @access  Public
 */
router.post("/decrypt", vigenereController.decryptWithKey);

/**
 * @route   POST /api/vigenere/crack
 * @desc    Crack Vigenère cipher without knowing the key
 * @access  Public
 */
router.post("/crack", vigenereController.crackCipher);

/**
 * @route   GET /api/vigenere/status
 * @desc    Get server status and stats
 * @access  Public
 */
router.get("/status", vigenereController.getStatus);

module.exports = router;

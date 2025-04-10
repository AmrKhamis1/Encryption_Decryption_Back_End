// API routes for vigenere cipher operations
const express = require("express");
const router = express.Router();
const vigenereController = require("../controllers/vigenereController");

router.post("/decrypt", vigenereController.decryptWithKey);

router.post("/crack", vigenereController.crackCipher);

router.get("/status", vigenereController.getStatus);

module.exports = router;

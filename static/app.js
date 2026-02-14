// static/app.js

window.addEventListener("DOMContentLoaded", () => {
  // -------------------- Elements --------------------
  const imgInput = document.getElementById("img");
  const ocrBtn = document.getElementById("ocrBtn");
  const ocrStatus = document.getElementById("ocrStatus");
  const ocrProgress = document.getElementById("ocrProgress");

  const textEl = document.getElementById("text");
  const kEl = document.getElementById("k");
  const topNEl = document.getElementById("topN");
  const runBtn = document.getElementById("run");
  const clearBtn = document.getElementById("clear");
  const statusEl = document.getElementById("status");

  const summaryEl = document.getElementById("summary");
  const keywordsEl = document.getElementById("keywords");

  const statsEl = document.getElementById("stats");           // optional
  const highlightedEl = document.getElementById("highlighted"); // optional

  const modeEl = document.getElementById("mode"); // should exist in HTML

  // Optional export buttons (must exist in HTML to work)
  const copyBtn = document.getElementById("copySummary");
  const downloadTxtBtn = document.getElementById("downloadTxt");
  const downloadPDFBtn = document.getElementById("downloadPDF");

  // Safety check (required IDs)
  const required = [imgInput, ocrBtn, textEl, kEl, topNEl, runBtn, clearBtn, summaryEl, keywordsEl, modeEl];
  if (required.some(x => !x)) {
    console.error("Missing required HTML element IDs. Check index.html IDs match app.js");
    return;
  }

  // -------------------- Helpers --------------------
  const setStatus = (msg) => { statusEl.textContent = msg || ""; };

  const clearList = (ul) => { ul.innerHTML = ""; };

  const addItem = (ul, txt) => {
    const li = document.createElement("li");
    li.textContent = txt;
    ul.appendChild(li);
  // -------- PASTE BUTTON --------
const pasteBtn = document.getElementById("pasteBtn");

if (pasteBtn) {
  pasteBtn.addEventListener("click", async () => {
    try {
      const clipText = await navigator.clipboard.readText();

      if (!clipText) {
        setStatus("Clipboard is empty.");
        return;
      }

      const current = textEl.value.trim();
      textEl.value = current ? (current + "\n\n" + clipText) : clipText;

      setStatus("Pasted ✅");
    } catch (err) {
      console.error(err);
      setStatus("Paste blocked ❌");
    }
  });
}

  };

  function escapeHTML(str){
    return String(str).replace(/[&<>"']/g, (m) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    }[m]));
  }

  // -------------------- Stopwords --------------------
  function STOPWORDSInit() {
    return new Set([
      "the","a","an","and","or","but","if","then","so","to","of","in","on","at","for","with","as","by","from",
      "is","are","was","were","be","been","being","it","this","that","these","those","we","you","they","he","she","i",
      "our","your","their","his","her","not","no","do","does","did","can","could","will","would","should","may","might"
    ]);
  }
  const STOPWORDS = STOPWORDSInit();
  console.log("Stopwords initialized:", STOPWORDS.size);

  // -------------------- OCR --------------------
  ocrBtn.addEventListener("click", async () => {
    const file = imgInput.files && imgInput.files[0];
    if (!file) {
      ocrStatus.textContent = "Please choose an image first.";
      return;
    }
    if (!window.Tesseract) {
      ocrStatus.textContent = "Tesseract library not loaded. Check internet/CDN.";
      return;
    }

    ocrStatus.textContent = "OCR started...";
    ocrProgress.style.width = "0%";

    try {
      const { data } = await Tesseract.recognize(file, "eng", {
        logger: (m) => {
          if (m.status) ocrStatus.textContent = m.status;
          if (typeof m.progress === "number") {
            ocrProgress.style.width = Math.round(m.progress * 100) + "%";
          }
        }
      });

      const result = (data && data.text ? data.text : "").trim();
      if (!result) {
        ocrStatus.textContent = "OCR finished, but no text detected.";
        return;
      }

      textEl.value = (textEl.value.trim() ? (textEl.value.trim() + "\n\n") : "") + result;
      ocrStatus.textContent = "OCR done ✅";
      ocrProgress.style.width = "100%";
    } catch (err) {
      console.error(err);
      ocrStatus.textContent = "OCR failed ❌ (see Console)";
    }
  });

  // -------------------- Text Processing --------------------
  function splitSentences(text) {
    return String(text)
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function getStats(text) {
    const sentences = splitSentences(text);
    const wordArr = String(text)
      .replace(/[^a-zA-Z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    const words = wordArr.length;
    const characters = String(text).length;
    const unique = new Set(wordArr.map(w => w.toLowerCase())).size;
    const avgSentenceLen = sentences.length ? (words / sentences.length) : 0;
    const readingTimeMin = words ? Math.max(1, Math.round(words / 200)) : 0;

    // simple difficulty score
    const difficultyScore = (unique / Math.max(1, sentences.length)) * 10 + (avgSentenceLen * 2);

    let difficulty = "Easy";
    if (difficultyScore > 20) difficulty = "Hard";
    else if (difficultyScore > 14) difficulty = "Medium";

    const readingLevel = words < 100 ? "Beginner" : (words < 300 ? "Intermediate" : "Advanced");

    return {
      sentences: sentences.length,
      words,
      unique,
      avgSentenceLen,
      readingTimeMin,
      difficulty,
      readingLevel,
      characters
    };
  }

  function renderStats(stats) {
    if (!statsEl) return;
    statsEl.innerHTML = "";
    addItem(statsEl, `Sentences: ${stats.sentences}`);
    addItem(statsEl, `Words: ${stats.words}`);
    addItem(statsEl, `Unique Words: ${stats.unique}`);
    addItem(statsEl, `Avg Sentence Length: ${stats.avgSentenceLen.toFixed(2)} words`);
    addItem(statsEl, `Reading Time: ${stats.readingTimeMin} min`);
    addItem(statsEl, `Difficulty: ${stats.difficulty}`);
    addItem(statsEl, `Reading Level: ${stats.readingLevel}`);
    addItem(statsEl, `Characters: ${stats.characters}`);
  }

  // Keywords (simple but clean)
  function keywords(text, topN = 8) {
    const words = String(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));

    const freq = new Map();
    for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);

    return [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([w, c]) => `${w} (${c})`);
  }

  function highlightKeywords(text, keywordsList) {
    if (!highlightedEl) return;
    if (!text) { highlightedEl.innerHTML = ""; return; }

    let safe = escapeHTML(text);

    for (const kw of keywordsList) {
      const firstWord = kw.split(" ")[0]; // highlight first token if phrase
      const escaped = firstWord.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      const re = new RegExp(`\\b(${escaped})\\b`, "gi");
      safe = safe.replace(re, (match) => `<mark>${match}</mark>`);
    }

    highlightedEl.innerHTML = safe.replace(/\n/g, "<br>");
  }

  // Summary Smart (scored)
  function summarizeSmart(text, k) {
    const sentences = splitSentences(text);
    if (!sentences.length) return [];

    const allWords = String(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));

    if (!allWords.length) return sentences.slice(0, k);

    const freq = new Map();
    for (const w of allWords) freq.set(w, (freq.get(w) || 0) + 1);

    const scored = sentences.map((s) => {
      const ws = s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(w => w.length >= 3 && !STOPWORDS.has(w) && !/^\d+$/.test(w));

      let score = 0;
      const seen = new Set();
      for (const w of ws) {
        if (!seen.has(w)) {
          score += freq.get(w) || 0;
          seen.add(w);
        }
      }

      // normalize
      score = score / Math.max(6, ws.length);
      return { s, score };
    });

    const top = scored
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map(x => x.s);

    // keep original order
    return sentences.filter(s => top.includes(s));
  }

  // -------------------- Export buttons (optional) --------------------
  if (copyBtn) {
    copyBtn.addEventListener("click", () => {
      const items = [...summaryEl.querySelectorAll("li")].map(li => li.textContent);
      const textToCopy = items.join("\n");

      navigator.clipboard.writeText(textToCopy).then(() => {
        setStatus("Copied ✅");
      }).catch(() => {
        setStatus("Copy failed ❌");
      });
    });
  }

  if (downloadTxtBtn) {
    downloadTxtBtn.addEventListener("click", () => {
      const items = [...summaryEl.querySelectorAll("li")].map(li => li.textContent);
      const blob = new Blob([items.join("\n")], { type: "text/plain" });

      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "summary.txt";
      a.click();
      URL.revokeObjectURL(a.href);
    });
  }

  if (downloadPDFBtn) {
    downloadPDFBtn.addEventListener("click", () => {
      if (!window.jspdf) {
        setStatus("jsPDF not loaded ❌");
        return;
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      const items = [...summaryEl.querySelectorAll("li")].map(li => li.textContent);

      doc.text(items.join("\n"), 10, 10);
      doc.save("summary.pdf");
    });
  }

  // -------------------- Run --------------------
  runBtn.addEventListener("click", () => {
    const text = (textEl.value || "").trim();
    if (!text) {
      setStatus("Paste some text first.");
      return;
    }

    const k = Math.max(1, Math.min(12, parseInt(kEl.value || "3", 10)));
    const topN = Math.max(1, Math.min(20, parseInt(topNEl.value || "8", 10)));

    // clear outputs
    clearList(summaryEl);
    clearList(keywordsEl);
    if (highlightedEl) highlightedEl.innerHTML = "";

    // stats
    const stats = getStats(text);
    renderStats(stats);

    // summary mode
    const mode = modeEl.value; // expected: free/ai (ai is placeholder)
    let summary = [];

    if (mode === "free") {
      // basic summary = first k sentences
      summary = splitSentences(text).slice(0, k);
    } else if (mode === "ai") {
      // placeholder for future API
      summary = summarizeSmart(text, k); // for now still local
    } else {
      // fallback
      summary = summarizeSmart(text, k);
    }

    summary.forEach(s => addItem(summaryEl, s));

    // keywords
    const kwList = keywords(text, topN);
    kwList.forEach(x => addItem(keywordsEl, x));

    // highlight (use raw keyword words)
    const rawKeywords = kwList.map(x => x.split(" (")[0]);
    highlightKeywords(text, rawKeywords);

    setStatus("Done ✅");
  });

  // -------------------- Clear --------------------
  clearBtn.addEventListener("click", () => {
    textEl.value = "";
    clearList(summaryEl);
    clearList(keywordsEl);
    if (statsEl) statsEl.innerHTML = "";
    if (highlightedEl) highlightedEl.innerHTML = "";
    setStatus("");
    if (ocrStatus) ocrStatus.textContent = "No OCR running.";
    if (ocrProgress) ocrProgress.style.width = "0%";
  });

  console.log("app.js loaded ✅");
});

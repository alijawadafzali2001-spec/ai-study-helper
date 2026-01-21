// frontend/static/app.js

window.addEventListener("DOMContentLoaded", () => {
  // Elements
  const imgInput = document.getElementById("img");
  const ocrBtn = document.getElementById("ocrBtn");
  const ocrStatus = document.getElementById("ocrStatus");
  const ocrProgress = document.getElementById("ocrProgress");

  const textEl = document.getElementById("text");
  const kEl = document.getElementById("k");         // summary points
  const topNEl = document.getElementById("topN");   // keywords
  const runBtn = document.getElementById("run");
  const clearBtn = document.getElementById("clear");
  const statusEl = document.getElementById("status");

  const summaryEl = document.getElementById("summary");
  const keywordsEl = document.getElementById("keywords");

  // Safety check
  const required = [imgInput, ocrBtn, textEl, kEl, topNEl, runBtn, clearBtn, summaryEl, keywordsEl];
  if (required.some(x => !x)) {
    console.error("Missing HTML element IDs. Check your index.html IDs match app.js");
    return;
  }

  // Helpers
  const setStatus = (msg) => { if (statusEl) statusEl.textContent = msg || ""; };
  const clearList = (ul) => { ul.innerHTML = ""; };
  const addItem = (ul, txt) => {
    const li = document.createElement("li");
    li.textContent = txt;
    ul.appendChild(li);
  };

  // -------- OCR --------
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

      // Put OCR text into textarea (append)
      textEl.value = (textEl.value.trim() ? (textEl.value.trim() + "\n\n") : "") + result;
      ocrStatus.textContent = "OCR done ✅";
      ocrProgress.style.width = "100%";
    } catch (err) {
      console.error(err);
      ocrStatus.textContent = "OCR failed ❌ (see Console)";
    }
  });

  // -------- Local summarizer + keywords (simple) --------
  function splitSentences(text) {
    return text
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  function keywords(text, topN = 8) {
    const stop = new Set([
      "the","a","an","and","or","but","if","then","so","to","of","in","on","at","for","with","as","by","from",
      "is","are","was","were","be","been","being","it","this","that","these","those","we","you","they","he","she","i",
      "our","your","their","his","her","not","no","do","does","did","can","could","will","would","should","may","might"
    ]);

    const words = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(w => w.length >= 3 && !stop.has(w));

    const freq = new Map();
    for (const w of words) freq.set(w, (freq.get(w) || 0) + 1);

    return [...freq.entries()]
      .sort((a,b) => b[1] - a[1])
      .slice(0, topN)
      .map(([w,c]) => `${w} (${c})`);
  }

  runBtn.addEventListener("click", () => {
    const text = (textEl.value || "").trim();
    if (!text) {
      setStatus("Paste some text first.");
      return;
    }

    const k = Math.max(1, Math.min(12, parseInt(kEl.value || "3", 10)));
    const topN = Math.max(1, Math.min(20, parseInt(topNEl.value || "8", 10)));

    clearList(summaryEl);
    clearList(keywordsEl);

    const sentences = splitSentences(text);
    const take = sentences.slice(0, k);
    take.forEach(s => addItem(summaryEl, s));

    keywords(text, topN).forEach(k => addItem(keywordsEl, k));

    setStatus("Done ✅");
  });

  clearBtn.addEventListener("click", () => {
    textEl.value = "";
    clearList(summaryEl);
    clearList(keywordsEl);
    setStatus("");
    if (ocrStatus) ocrStatus.textContent = "No OCR running.";
    if (ocrProgress) ocrProgress.style.width = "0%";
  });

  console.log("app.js loaded ✅");
});

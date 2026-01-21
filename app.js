// -------------------- Helpers --------------------
const $ = (id) => document.getElementById(id);

const STOPWORDS = new Set([
  "i","me","my","myself","we","our","ours","ourselves","you","your","yours",
  "yourself","yourselves","he","him","his","himself","she","her","hers","herself",
  "it","its","itself","they","them","their","theirs","themselves",
  "what","which","who","whom","this","that","these","those",
  "am","is","are","was","were","be","been","being",
  "and","or","but","so","if","then",
  "in","on","to","of","for","with","a","an","the",
  "about","has","have","had","do","does","did",
  "can","could","should","would","may","might","will","just",
  "more","most","also","often","even","very","really","still","too",
  "here","there","when","where","why","how",
  // extra filler
  "thing","things","someone","something","anything","everything",
  "people","person","time","way","ways","today","now",
  // extra common verbs (helps keywords)
  "make","makes","made","get","gets","got","go","goes","went",
  "say","says","said","see","sees","saw","use","uses","used"
]);

function cleanText(t){
  return (t || "")
    .toLowerCase()
    .replace(/[’']/g,"")                 // normalize quotes
    .replace(/[^\p{L}\p{N}\s]/gu," ")    // keep letters/numbers/spaces (unicode)
    .replace(/\s+/g," ")
    .trim();
}

function splitSentences(t){
  const raw = (t || "")
    .replace(/\n+/g, " ")
    .split(/[\.\!\?]+/g)
    .map(s => s.trim())
    .filter(Boolean);

  // also remove near-duplicate sentences from input (basic cleanup)
  return dedupeSentences(raw, 0.92);
}

function tokenize(t, { keepStopwords=false } = {}){
  return cleanText(t)
    .split(" ")
    .filter(w => {
      if(!w) return false;
      if(/^\d+$/.test(w)) return false;           // remove pure numbers
      if(/^(.)\1{3,}$/.test(w)) return false;     // remove aaaaa spam
      if(w.length < 4) return false;
      if(!keepStopwords && STOPWORDS.has(w)) return false;
      return true;
    });
}

function renderList(el, items){
  el.innerHTML = "";
  for(const it of items){
    const li = document.createElement("li");
    li.textContent = it;
    el.appendChild(li);
  }
}

// -------------------- Similarity / Dedupe --------------------
function jaccard(aTokens, bTokens){
  const A = new Set(aTokens);
  const B = new Set(bTokens);
  if(A.size === 0 || B.size === 0) return 0;

  let inter = 0;
  for(const x of A) if(B.has(x)) inter++;
  return inter / (A.size + B.size - inter);
}

function dedupeSentences(sentences, threshold=0.65){
  const final = [];
  const tokenCache = new Map();

  for(const s of sentences){
    const ts = tokenCache.get(s) || tokenize(s, { keepStopwords: true });
    tokenCache.set(s, ts);

    let dup = false;
    for(const f of final){
      const tf = tokenCache.get(f) || tokenize(f, { keepStopwords: true });
      tokenCache.set(f, tf);

      if(jaccard(ts, tf) >= threshold){
        dup = true;
        break;
      }
    }
    if(!dup) final.push(s);
  }
  return final;
}

// -------------------- Keywords (better + bigrams) --------------------
function extractKeywords(text, topN){
  const tokens = tokenize(text);
  if(tokens.length === 0) return [];

  const freq = new Map();

  // unigrams
  for(const w of tokens){
    freq.set(w, (freq.get(w)||0) + 1);
  }

  // bigrams (strong phrases)
  for(let i=0; i<tokens.length-1; i++){
    const a = tokens[i], b = tokens[i+1];
    const bi = `${a} ${b}`;
    // bigram bonus, but not too strong
    freq.set(bi, (freq.get(bi)||0) + 0.8);
  }

  // sort by weight
  const sorted = [...freq.entries()].sort((x,y)=> y[1]-x[1]);

  // pick top, prefer phrases, avoid redundant words inside phrases
  const out = [];
  for(const [w] of sorted){
    if(out.length >= topN) break;

    if(w.includes(" ")){
      // phrase: always nice
      out.push(w);
      continue;
    }

    // skip single word if already contained in a chosen phrase
    if(out.some(k => k.includes(" ") && k.split(" ").includes(w))) continue;

    out.push(w);
  }

  // final tiny cleanup: remove super generic leftovers
  return out.filter(k => !STOPWORDS.has(k));
}

// -------------------- Sentence scoring --------------------
function buildWordWeights(text){
  const tokensAll = tokenize(text);
  const freq = new Map();
  for(const w of tokensAll){
    freq.set(w, (freq.get(w)||0) + 1);
  }

  // sublinear scaling: 1 + log(freq)
  const weights = new Map();
  for(const [w,c] of freq.entries()){
    weights.set(w, 1 + Math.log(1 + c));
  }
  return weights;
}

function sentenceScore(sentence, wordWeights){
  const ws = tokenize(sentence);
  if(ws.length === 0) return 0;

  let score = 0;
  const seen = new Set();

  for(const w of ws){
    if(seen.has(w)) continue;
    score += (wordWeights.get(w) || 0);
    seen.add(w);
  }

  // penalties for too short / too generic sentences
  if(ws.length < 6) score *= 0.55;
  if(ws.length < 10) score *= 0.85;

  // normalize by length to avoid long sentence always winning
  score = score / Math.max(7, ws.length);

  // tiny bonus if sentence contains a phrase-like structure
  if(sentence.includes(",") || sentence.includes(";")) score *= 1.03;

  return score;
}

// -------------------- Summary (MMR diversity + dedupe) --------------------
function summarizeMMR(text, k){
  const sentences = splitSentences(text);
  if(!sentences.length) return [];

  // fallback: if too short, just return unique sentences
  if(sentences.length <= k){
    return sentences;
  }

  const wordWeights = buildWordWeights(text);

  // score each sentence
  const scored = sentences.map((s, idx) => {
    const sTokens = tokenize(s, { keepStopwords: true }); // for similarity
    const base = sentenceScore(s, wordWeights);
    return { s, idx, base, tokens: sTokens };
  });

  // MMR selection
  const lambda = 0.72; // relevance vs diversity
  const selected = [];
  const chosenIdx = new Set();

  // pick first by highest base score
  scored.sort((a,b)=> b.base - a.base);
  selected.push(scored[0]);
  chosenIdx.add(scored[0].idx);

  while(selected.length < k){
    let best = null;
    let bestScore = -Infinity;

    for(const cand of scored){
      if(chosenIdx.has(cand.idx)) continue;

      // similarity to already selected
      let maxSim = 0;
      for(const sel of selected){
        const sim = jaccard(cand.tokens, sel.tokens);
        if(sim > maxSim) maxSim = sim;
      }

      const mmr = lambda * cand.base - (1 - lambda) * maxSim;

      if(mmr > bestScore){
        bestScore = mmr;
        best = cand;
      }
    }

    if(!best) break;
    selected.push(best);
    chosenIdx.add(best.idx);
  }

  // final: remove near-duplicates among chosen, keep original order
  const chosenSentences = selected
    .sort((a,b)=> a.idx - b.idx)
    .map(x => x.s);

  const cleaned = dedupeSentences(chosenSentences, 0.78);

  // ensure we still have k if possible
  return cleaned.slice(0, k);
}

// -------------------- Mode: Free vs AI (API later) --------------------
async function runAI(text, k, topN){
  // placeholder for later:
 async function runAI(text, k, topN){
  // Local dev:
  // - Frontend: Live Server -> http://127.0.0.1:5500
  // - Backend: Node API -> http://localhost:3000
  const API_URL = "http://localhost:3000/api/analyze";

  const r = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, k, topN, task: "both" })
  });

  if(!r.ok){
    const err = await r.json().catch(()=>({}));
    throw new Error(err.error || "API error");
  }

  const data = await r.json();
  return { summary: data.summary || [], keywords: data.keywords || [] };
}


  // const r = await fetch("/api/summarize", {method:"POST", headers:{...}, body: JSON.stringify({text,k,top_n:topN})})
  // const data = await r.json()
  // return { summary: data.summary, keywords: data.keywords }
  throw new Error("AI mode is not connected yet. Use Free mode for now.");
}

// -------------------- UI actions --------------------
$("run").addEventListener("click", async () => {
  const text = $("text").value.trim();
  const k = Math.max(1, Math.min(12, parseInt($("k").value || "3", 10)));
  const topN = Math.max(1, Math.min(20, parseInt($("topN").value || "8", 10)));
  const mode = $("mode").value;

  if(text.length < 10){
    $("status").textContent = "Please paste more text.";
    return;
  }

  $("status").textContent = "Running...";
  $("run").disabled = true;

  try{
    if(mode === "free"){
      const summary = summarizeMMR(text, k);
      const kws = extractKeywords(text, topN);

      renderList($("summary"), summary);
      renderList($("keywords"), kws);
    }else{
      const { summary, keywords } = await runAI(text, k, topN);
      renderList($("summary"), summary || []);
      renderList($("keywords"), keywords || []);
    }
    $("status").textContent = "Done ✅";
  }catch(e){
    $("status").textContent = "Error: " + e.message;
  }finally{
    $("run").disabled = false;
  }
});

$("clear").addEventListener("click", () => {
  $("text").value = "";
  $("summary").innerHTML = "";
  $("keywords").innerHTML = "";
  $("status").textContent = "";
  $("ocrStatus").textContent = "No OCR running.";
  $("ocrProgress").style.width = "0%";
});

// -------------------- OCR (English only) --------------------
$("ocrBtn").addEventListener("click", async () => {
  const file = $("img").files[0];
  if(!file){
    alert("Choose an image first.");
    return;
  }

  $("ocrBtn").disabled = true;
  $("ocrStatus").textContent = "OCR running...";
  $("ocrProgress").style.width = "0%";

  try{
    const result = await Tesseract.recognize(file, "eng", {
      logger: m => {
        if(m.status){
          $("ocrStatus").textContent = m.status;
        }
        if(m.progress != null){
          $("ocrProgress").style.width = Math.round(m.progress * 100) + "%";
        }
      }
    });

    const extracted = (result?.data?.text || "").trim();
    if(extracted){
      $("text").value = ($("text").value ? $("text").value + "\n\n" : "") + extracted;
      $("ocrStatus").textContent = "OCR done ✅";
    }else{
      $("ocrStatus").textContent = "OCR finished, but no text was found.";
    }
  }catch(err){
    $("ocrStatus").textContent = "OCR error: " + (err.message || err);
  }finally{
    $("ocrBtn").disabled = false;
  }
});

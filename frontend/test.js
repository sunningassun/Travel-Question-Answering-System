// DOM 元素
const modeSelect = document.getElementById("modeSelect");
const modelGroup = document.getElementById("modelGroup");
const modelSelect = document.getElementById("modelSelect");
const collabTypeGroup = document.getElementById("collabTypeGroup");
const collabTypeSelect = document.getElementById("collabTypeSelect");
const retrievalGroup = document.getElementById("retrievalGroup");
const retrievalModeSelect = document.getElementById("retrievalMode");

const factualDiv = document.getElementById("factualQuestions");
const reasoningDiv = document.getElementById("reasoningQuestions");
const multiHopDiv = document.getElementById("multiHopQuestions");
const answerBox = document.getElementById("answerBox");
const responseTimeSpan = document.getElementById("responseTime");
const chunkCountSpan = document.getElementById("chunkCount");
const accurateBtn = document.getElementById("accurateBtn");
const inaccurateBtn = document.getElementById("inaccurateBtn");
const evalMessageDiv = document.getElementById("evalMessage");

let currentQuery = "", currentAnswer = "", currentResponseTime = 0, currentRetrievedCount = 0;
let currentQuestionType = "factual";
let currentRetrievalMode = "hybrid";
let currentCollabType = "R1_to_V3";

function updateUI() {
    const mode = modeSelect.value;
    const isPure = mode === "pure";
    const isRag = mode === "rag";
    const isCollab = mode === "collab";

    modelGroup.style.display = (isPure || isRag) ? "flex" : "none";
    collabTypeGroup.style.display = isCollab ? "flex" : "none";
    retrievalGroup.style.display = isRag ? "flex" : "none";
}
modeSelect.addEventListener("change", updateUI);
collabTypeSelect.addEventListener("change", () => { currentCollabType = collabTypeSelect.value; });
retrievalModeSelect.addEventListener("change", () => { currentRetrievalMode = retrievalModeSelect.value; });
updateUI();

async function loadQuestions() {
    const res = await fetch("/questions");
    const data = await res.json();
    renderQuestions(factualDiv, data.factual || [], "factual");
    renderQuestions(reasoningDiv, data.reasoning || [], "reasoning");
    renderQuestions(multiHopDiv, data["multi-hop"] || [], "multi-hop");
}
function renderQuestions(container, questions, type) {
    container.innerHTML = "";
    questions.forEach(q => {
        const div = document.createElement("div");
        div.className = "question-item";
        div.innerText = q;
        div.onclick = () => sendQuery(q, type);
        container.appendChild(div);
    });
}

async function sendQuery(query, questionType) {
    currentQuery = query;
    currentQuestionType = questionType;
    answerBox.innerText = "🤔 思考中...";
    responseTimeSpan.innerText = "-";
    chunkCountSpan.innerText = "-";
    evalMessageDiv.innerText = "";

    const mode = modeSelect.value;
    let requestBody = {
        query: query,
        mode: mode,
        retrieval_mode: (mode === "rag") ? currentRetrievalMode : "none"
    };
    if (mode === "pure" || mode === "rag") {
        requestBody.model = modelSelect.value;
    } else if (mode === "collab") {
        requestBody.collab_type = collabTypeSelect.value;
        requestBody.retrieval_mode = "hybrid"; // 合作模式暂不使用检索，可自行开启
    }

    try {
        const start = performance.now();
        const res = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const elapsed = (performance.now() - start) / 1000;
        currentAnswer = data.answer;
        currentResponseTime = data.response_time || elapsed;
        currentRetrievedCount = data.retrieved_chunks ? data.retrieved_chunks.length : 0;
        answerBox.innerText = currentAnswer;
        responseTimeSpan.innerText = currentResponseTime.toFixed(3);
        chunkCountSpan.innerText = currentRetrievedCount;
    } catch (err) {
        answerBox.innerText = `错误: ${err.message}`;
    }
}

async function submitEvaluation(isAccurate) {
    if (!currentQuery) { alert("请先回答问题"); return; }
    const mode = modeSelect.value;
    let modelName = "";
    if (mode === "pure" || mode === "rag") {
        modelName = modelSelect.value;
    } else if (mode === "collab") {
        const collabMap = {
            "R1_to_V3": "R1→V3", "V3_to_R1": "V3→R1",
        };
        modelName = collabMap[collabTypeSelect.value] || "R1→V3";
    }
    const evalData = {
        query: currentQuery,
        model: modelName,
        mode: mode,
        retrieval_mode: (mode === "rag") ? currentRetrievalMode : "none",
        question_type: currentQuestionType,
        answer: currentAnswer,
        response_time: currentResponseTime,
        retrieved_count: currentRetrievedCount,
        is_accurate: isAccurate
    };
    try {
        const res = await fetch("/evaluate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(evalData)
        });
        if (!res.ok) throw new Error(await res.text());
        const result = await res.json();
        evalMessageDiv.innerText = `✅ 评估已记录 (总计 ${result.total} 条)`;
        evalMessageDiv.style.color = "green";
        setTimeout(() => evalMessageDiv.innerText = "", 3000);
    } catch (err) {
        evalMessageDiv.innerText = `❌ 记录失败: ${err.message}`;
        evalMessageDiv.style.color = "red";
    }
}

accurateBtn.onclick = () => submitEvaluation(true);
inaccurateBtn.onclick = () => submitEvaluation(false);
loadQuestions();
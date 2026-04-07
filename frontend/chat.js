// 当前会话状态
let currentQuery = "";
let currentAnswer = "";
let currentResponseTime = 0;
let currentRetrievedCount = 0;
let currentRetrievalMode = "hybrid";

const modelSelect = document.getElementById("modelSelect");
const modeSelect = document.getElementById("modeSelect");
const retrievalStrategyGroup = document.getElementById("retrievalStrategyGroup");
const retrievalModeSelect = document.getElementById("retrievalMode");
const userQueryInput = document.getElementById("userQuery");
const sendBtn = document.getElementById("sendBtn");
const answerBox = document.getElementById("answerBox");
const responseTimeSpan = document.getElementById("responseTime");
const chunkCountSpan = document.getElementById("chunkCount");
const accurateBtn = document.getElementById("accurateBtn");
const inaccurateBtn = document.getElementById("inaccurateBtn");
const evalMessageDiv = document.getElementById("evalMessage");

function onModeChange() {
    const mode = modeSelect.value;
    const isRag = mode === "rag";
    const isCollab = mode === "collab";

    retrievalStrategyGroup.style.display = isRag ? "flex" : "none";
    modelSelect.disabled = isCollab;
    if (isCollab) modelSelect.value = "R1";
    else modelSelect.disabled = false;
}
modeSelect.addEventListener("change", onModeChange);
onModeChange();

async function sendQuery() {
    const query = userQueryInput.value.trim();
    if (!query) {
        alert("请输入问题");
        return;
    }
    currentQuery = query;
    currentRetrievalMode = retrievalModeSelect.value;

    const model = modelSelect.value;
    const mode = modeSelect.value;
    const retrievalMode = retrievalModeSelect.value;

    answerBox.innerText = "🤔 思考中...";
    responseTimeSpan.innerText = "-";
    chunkCountSpan.innerText = "-";
    evalMessageDiv.innerText = "";

    try {
        const requestBody = {
            query: query,
            model: model,
            mode: mode,
            retrieval_mode: (mode === "rag" || mode === "collab") ? retrievalMode : "none"
        };
        const start = performance.now();
        const res = await fetch("/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody)
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const elapsed = (performance.now() - start) / 1000;

        currentAnswer = data.answer;
        currentResponseTime = data.response_time || elapsed;
        currentRetrievedCount = data.retrieved_chunks ? data.retrieved_chunks.length : 0;

        answerBox.innerText = currentAnswer;
        responseTimeSpan.innerText = currentResponseTime.toFixed(3);
        if (mode === "rag" || mode === "collab") {
            chunkCountSpan.innerText = currentRetrievedCount;
        } else {
            chunkCountSpan.innerText = "N/A";
        }
    } catch (err) {
        answerBox.innerText = `错误: ${err.message}`;
        console.error(err);
    }
}

async function submitEvaluation(isAccurate) {
    if (!currentQuery) {
        alert("请先发送一个问题");
        return;
    }
    let effectiveModel = modelSelect.value;
    if (modeSelect.value === "collab") effectiveModel = "R1+V3";

    const evalData = {
        query: currentQuery,
        model: effectiveModel,
        mode: modeSelect.value,
        retrieval_mode: (modeSelect.value === "rag") ? currentRetrievalMode : "none",
        question_type: "free_chat",
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
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const result = await res.json();
        evalMessageDiv.innerText = `✅ 评估已记录 (总计 ${result.total} 条)`;
        evalMessageDiv.style.color = "#2ecc71";
        setTimeout(() => evalMessageDiv.innerText = "", 3000);
    } catch (err) {
        evalMessageDiv.innerText = `❌ 记录失败: ${err.message}`;
        evalMessageDiv.style.color = "#e74c3c";
        console.error(err);
    }
}

sendBtn.onclick = sendQuery;
accurateBtn.onclick = () => submitEvaluation(true);
inaccurateBtn.onclick = () => submitEvaluation(false);
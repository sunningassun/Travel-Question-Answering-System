let charts = {};

async function refreshStats() {
    try {
        const response = await fetch("/stats");
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const stats = await response.json();
        console.log("统计数据:", stats);

        // 销毁旧图表
        Object.values(charts).forEach(chart => chart.destroy());
        charts = {};

        // 1. 整体准确率对比（纯模型 vs RAG vs 合作模式）
        const accCtx = document.getElementById("overallAccuracyChart").getContext("2d");
        charts.overallAccuracy = new Chart(accCtx, {
            type: 'bar',
            data: {
                labels: ['纯模型', 'RAG', '合作模式'],
                datasets: [{
                    label: '准确率',
                    data: [stats.pure_accuracy, stats.rag_accuracy, stats.collab_accuracy],
                    backgroundColor: ['#3498db', '#2ecc71', '#9b59b6']
                }]
            },
            options: {
                scales: { y: { beginAtZero: true, max: 1, title: { display: true, text: '准确率' } } },
                plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${(ctx.raw * 100).toFixed(1)}%` } } }
            }
        });

        // 2. 整体响应时间对比
        const timeCtx = document.getElementById("overallTimeChart").getContext("2d");
        charts.overallTime = new Chart(timeCtx, {
            type: 'bar',
            data: {
                labels: ['纯模型', 'RAG', '合作模式'],
                datasets: [{
                    label: '平均响应时间 (秒)',
                    data: [stats.pure_response_time, stats.rag_response_time, stats.collab_response_time],
                    backgroundColor: '#e67e22'
                }]
            },
            options: { scales: { y: { beginAtZero: true, title: { display: true, text: '秒' } } } }
        });

        // 3. 平均检索文档数（仅RAG）
        const avgRetrievedCtx = document.getElementById("avgRetrievedChart").getContext("2d");
        charts.avgRetrieved = new Chart(avgRetrievedCtx, {
            type: 'bar',
            data: {
                labels: ['RAG 平均检索文档数'],
                datasets: [{ label: '文档数', data: [stats.avg_retrieved_docs_rag], backgroundColor: '#1abc9c' }]
            },
            options: { scales: { y: { beginAtZero: true, title: { display: true, text: '文档数' } } } }
        });

        // 4. 问题类型准确率
        const qtypeLabels = Object.keys(stats.question_type_accuracy);
        const qtypeData = qtypeLabels.map(l => stats.question_type_accuracy[l]);
        const qtypeCtx = document.getElementById("questionTypeAccChart").getContext("2d");
        charts.questionTypeAcc = new Chart(qtypeCtx, {
            type: 'bar',
            data: {
                labels: qtypeLabels.map(l => l === 'factual' ? '事实型' : (l === 'reasoning' ? '推理型' : '多跳推理型')),
                datasets: [{ label: '准确率', data: qtypeData, backgroundColor: '#f1c40f' }]
            },
            options: { scales: { y: { beginAtZero: true, max: 1, title: { display: true, text: '准确率' } } } }
        });

        // 5. 三种检索方式准确率
        const retrievalLabels = Object.keys(stats.retrieval_method_accuracy);
        const retrievalAccData = retrievalLabels.map(l => stats.retrieval_method_accuracy[l]);
        const retrievalAccCtx = document.getElementById("retrievalAccChart").getContext("2d");
        charts.retrievalAcc = new Chart(retrievalAccCtx, {
            type: 'bar',
            data: {
                labels: retrievalLabels.map(l => l === 'hybrid' ? '混合检索' : (l === 'semantic' ? '纯语义' : '纯关键词')),
                datasets: [{ label: '准确率', data: retrievalAccData, backgroundColor: '#e84393' }]
            },
            options: { scales: { y: { beginAtZero: true, max: 1, title: { display: true, text: '准确率' } } } }
        });

        // 6. 三种检索方式响应时间
        const retrievalTimeData = retrievalLabels.map(l => stats.retrieval_method_response_time[l]);
        const retrievalTimeCtx = document.getElementById("retrievalTimeChart").getContext("2d");
        charts.retrievalTime = new Chart(retrievalTimeCtx, {
            type: 'bar',
            data: {
                labels: retrievalLabels.map(l => l === 'hybrid' ? '混合检索' : (l === 'semantic' ? '纯语义' : '纯关键词')),
                datasets: [{ label: '平均响应时间 (秒)', data: retrievalTimeData, backgroundColor: '#f39c12' }]
            },
            options: { scales: { y: { beginAtZero: true, title: { display: true, text: '秒' } } } }
        });

        // 7. 模型对比（R1 vs V3）准确率和响应时间双轴图
        const modelCompareCtx = document.getElementById("modelCompareChart").getContext("2d");
        charts.modelCompare = new Chart(modelCompareCtx, {
            type: 'bar',
            data: {
                labels: ['DeepSeek-R1', 'DeepSeek-V3'],
                datasets: [
                    { label: '准确率', data: [stats.model_accuracy.R1, stats.model_accuracy.V3], backgroundColor: '#2c3e50', yAxisID: 'y' },
                    { label: '响应时间 (秒)', data: [stats.model_response_time.R1, stats.model_response_time.V3], backgroundColor: '#e74c3c', yAxisID: 'y1' }
                ]
            },
            options: {
                scales: {
                    y: { beginAtZero: true, max: 1, title: { display: true, text: '准确率' } },
                    y1: { position: 'right', beginAtZero: true, title: { display: true, text: '响应时间 (秒)' }, grid: { drawOnChartArea: false } }
                }
            }
        });

        // 8. 合作模式组合对比（准确率和响应时间）
        const collabCombos = stats.collab_combinations || {};
        const comboLabels = Object.keys(collabCombos);
        const comboAcc = comboLabels.map(l => collabCombos[l].accuracy);
        const comboTime = comboLabels.map(l => collabCombos[l].response_time);
        const collabCtx = document.getElementById("collabCompareChart").getContext("2d");
        charts.collabCompare = new Chart(collabCtx, {
            type: 'bar',
            data: {
                labels: comboLabels,
                datasets: [
                    { label: '准确率', data: comboAcc, backgroundColor: '#2ecc71', yAxisID: 'y' },
                    { label: '响应时间 (秒)', data: comboTime, backgroundColor: '#e67e22', yAxisID: 'y1' }
                ]
            },
            options: {
                scales: {
                    y: { beginAtZero: true, max: 1, title: { display: true, text: '准确率' } },
                    y1: { position: 'right', beginAtZero: true, title: { display: true, text: '响应时间 (秒)' }, grid: { drawOnChartArea: false } }
                },
                plugins: { tooltip: { callbacks: { label: (ctx) => {
                    if (ctx.dataset.label === '准确率') return `准确率: ${(ctx.raw * 100).toFixed(1)}%`;
                    else return `响应时间: ${ctx.raw.toFixed(2)} 秒`;
                } } } }
            }
        });

        // 9. 雷达图
        const radarCtx = document.getElementById("radarChart").getContext("2d");
        if (radarCtx) {
            if (charts.radar) charts.radar.destroy();

            // 找出所有数据集中响应时间的最大值，用于归一化
            let maxResponseTime = 0;
            stats.radar_datasets.forEach(ds => {
                const rt = ds.data[1]; // 响应时间是第二个维度
                if (rt > maxResponseTime) maxResponseTime = rt;
            });
            // 避免除以0
            maxResponseTime = maxResponseTime || 1;

            // 归一化处理：准确率不变（已在0-1），响应时间除以最大值，检索文档数除以8
            const normalizedDatasets = stats.radar_datasets.map(ds => ({
                label: ds.label,
                data: [
                    ds.data[0],                          // 准确率 (0-1)
                    ds.data[1] / maxResponseTime,        // 响应时间归一化
                    ds.data[2] / 8                       // 检索文档数归一化 (最大值8)
                ],
                borderColor: ds.borderColor,
                backgroundColor: 'rgba(0,0,0,0)',
                fill: false,
                tension: 0.1,
                // 保存原始数据用于tooltip
                originalData: ds.data
            }));

            charts.radar = new Chart(radarCtx, {
                type: 'radar',
                data: {
                    labels: stats.radar_labels.map(l => `${l}\n(归一化值)`),
                    datasets: normalizedDatasets
                },
                options: {
                    scales: {
                        r: {
                            beginAtZero: true,
                            max: 1,
                            title: { display: true, text: '相对性能 (0-1)' },
                            ticks: { stepSize: 0.2 }
                        }
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: (ctx) => {
                                    const dataset = ctx.dataset;
                                    const original = dataset.originalData;
                                    const label = ctx.label.split('\n')[0];
                                    let value = '';
                                    if (label === '准确率') value = `${(original[0] * 100).toFixed(1)}%`;
                                    else if (label === '响应时间(秒)') value = `${original[1].toFixed(1)} 秒`;
                                    else if (label === '检索文档数') value = `${original[2].toFixed(1)} 个`;
                                    return `${ctx.dataset.label}: ${value}`;
                                }
                            }
                        }
                    }
                }
            });
        }

    } catch (error) {
        console.error("刷新统计失败:", error);
        alert("加载统计数据失败，请检查后端服务。");
    }
}

document.getElementById("manualRefreshBtn").addEventListener("click", refreshStats);
refreshStats();
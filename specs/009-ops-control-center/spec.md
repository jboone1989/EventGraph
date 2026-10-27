# Spec 009 · 无人运营后台控制台

Status: 用户于 2026-10-26 批准。前置：Spec `unattended-ops-ui`，不增加人工出版流程。

## 目标
- `/admin` 从跳转至运行明细改成真实运营总览：Worker 心跳、24h 新新闻处理、积压/失败、信源健康、异常诊断入口，真实时间戳及自动刷新。
- 重构现有后台导航为“总览/运行/采集与内容/模型/效果/系统”，桌面 1440px、移动 390px 都可清楚操作，明确选中项。复用现有 Tailwind token、AdminPage/Card/Stat 和 API，不引入 UI 框架。
- 数据来源只有现有 `/api/admin/runs`、`/api/admin/sources`；接口故障须显示未获取而非 0 或健康。Ferro 尚未接入时不伪造工作状态。
- 移除内容诊断中已废弃的人工编辑操作文案。

## 非目标
不改变首页、日报、事件树、知识图谱、前台 `/research`/`/en/research` 和已发布文章；不改变 DB、模型或采集作业，生产 VM09 不变。

## 验收
`/admin` 显示运营总览而不是跳转；移动导航“更多”不被遮挡；子页只高亮实际选中的菜单；检查 typecheck、Web build、CI/E2E；真实 VM13 发布后再确认。

参考：Temporal Web UI 的状态→失败→执行历史分层原则（https://docs.temporal.io/web-ui）。不复制架构或另造监控服务。

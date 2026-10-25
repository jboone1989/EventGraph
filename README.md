# EventGraph

**面向多个 AI Agent 的公共事件知识基础设施。**

EventGraph 聚合新闻、公告及研究，保留原始来源与发布时间，将相关报道组织为事件，面向网站读者与多个独立 Agent 提供 RSS、API、MCP 接入。长时序实体关系知识层计划使用 Graphiti + Neo4j；未实际验收的功能不宣称已经上线。

## 定位

- **EventGraph**：共享知识基础设施，负责采集、去重、事件组织、索引、检索与知识服务。
- **Ferro**：独立研究及内容 Agent，通过 EventGraph 的公开接口读取证据。
- **AIHot**：上游开源新闻引擎，与 EventGraph 不是同一产品。

## 产品演进规划

- [地区冲突影响追踪（规划 v0.1）](specs/event-impact-tracing/spec.md)：政策变化 → 供应链 → 企业暴露 → 市场反应的可验证证据链；含阶段路线、反方意见及首个真实案例的验收标准。**这是规划记录，不表示已实现或已批准全面开发。**

## 技术栈

Node.js 24、PostgreSQL 17、Docker Compose。Graphiti、Neo4j 与 NVIDIA 模型端点为知识图谱路线，按实际交付进度集成。

## 本地运行

```bash
git clone https://github.com/jboone1989/AIHOT.git eventgraph
cd eventgraph
cp .env.example .env
# 填写 .env 中的必要密钥与配置
docker compose up -d --build
```

请参考 [部署指南](docs/deploy.md) 与 [定制指南](docs/customize.md) 配置服务。

## 命名及迁移兼容性

产品名和镜像命名为 EventGraph；为保护现有持久化数据，Compose 项目名、数据库用户/库名、旧版环境变量 `AIHOT_*`、内部 workspace 包名 `@aihot/*` 以及 MCP 工具前缀暂时不改。外部接口不应因为一次品牌更新被破坏。进行生产数据迁移时，先备份、检查实际 volumes，再逐项迁移。**切勿直接删除旧 Compose 项目或卷。**

## 上游与许可证

本项目基于 [KKKKhazix/AIHOT](https://github.com/KKKKhazix/AIHOT) 开发。原版由上游作者维护；此项目是独立衍生开发，不代表原作者。

保留上游 MIT 许可证，详见 [LICENSE](LICENSE)。原版技术文档可参阅 [AIHot 上游项目](https://github.com/KKKKhazix/AIHOT)。

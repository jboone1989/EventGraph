import type { ProviderManagement } from "@aihot/contracts/providers";

type Workflow = ProviderManagement["workflows"][number];

export function workflowStageStatus(stage: Workflow, data: ProviderManagement) {
  const model = data.models.find(m => "model:" + m.id === stage.model);
  const provider = model ? data.providers.find(c => c.id === model.providerId) : undefined;
  const check = model?.checks.find(c => c.capability === "text");
  if (!model) {
    return {
      kind: stage.model.startsWith("model:") ? "problem" : "unverified",
      reason: stage.model.startsWith("model:")
        ? "指定模型已不在注册表中，请重新选择"
        : "使用环境或旧模型路径，尚无可核对的注册模型能力测试",
      model, provider, check, canTest: false,
    } as const;
  }
  const reason = !provider ? "Provider 连接不存在"
    : !provider.enabled ? "Provider 连接已停用"
    : !provider.credential.configured ? "Provider 凭据未配置"
    : !model.enabled ? "模型未启用"
    : !model.routeEnabled ? "模型未开放工作流路由"
    : !model.routing.eligibleCapabilities.includes("text")
      ? model.routing.reasons.join("；") || "缺少当前有效的文本能力测试"
      : null;
  return {
    kind: reason ? "problem" : "ready", reason: reason ?? "已启用、可路由且通过文本能力验证",
    model, provider, check,
    canTest: Boolean(model.probeSpec?.capability === "text" && provider?.enabled && provider.credential.configured),
  } as const;
}

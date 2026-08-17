# @deepseek-ai/dsh-review-policy

[English](README.md) | 中文

任务审查策略（`ctx.reviewPolicy`）：M5 决策里程碑的信任档。`strict`（默认，等同 M3 行为）、`balanced`（当前等同 `strict`）与 `trusted`——唯一让 `defersBatchConfirm` 读到 true 的档位，使 gate 服务可以放行纯 B 阶段由 A 检查结算，同时 B item 保持打开作为补签凭据。服务还拥有完成守卫（open 的 `b-confirm` item 与悬置的 rewind 决策否决 `completeTask`）与修复熔断：带熔断键的 check 连续失败达到上限时，把 phase run 停到 `recovery` 决策 item 之后。

## 配置

服务装配在任务 provider、recipe 注册表、attention 服务与 workbench journal 之后，自身无配置。

```yaml
- id: task-local
  name: '@deepseek-ai/dsh-task-local'
- id: recipe
  name: '@deepseek-ai/dsh-recipe'
- id: attention
  name: '@deepseek-ai/dsh-attention'
- id: review-policy
  name: '@deepseek-ai/dsh-review-policy'
```

## 服务契约

- `setTier(taskId, tier, actor, idempotencyKey)` / `getTier(taskId)` —— 显式档位写入与读取；未设置的任务读作 `strict`。记 `review-policy/tier-set`。
- `defersBatchConfirm(taskId)` —— gate 服务的只读口：仅 `trusted` 为 true。纯 B 阶段放行；含任一 C 类 check 仍阻塞。
- `applyBreakerDecision(itemId, phaseRunRevision, actor, idempotencyKey)` —— 落地一个已解决的 `breaker-tripped` 决策：`continue-repair` 计数归零并恢复被停的 run；`pause`/`cancel` 路由到任务命令；`patch` 只记选择不写任务面。未解决或外来 item 显式失败。记 `review-policy/breaker-decision`。
- 完成守卫在初始化时注册：任务的 open `b-confirm` item 否决完成（`unsigned B item(s)`），open 的 `rewind` 决策否决完成（`suspended rewind decision(s)`）。
- 熔断监听 `gate-check/recorded`：失败判定使 per-(task, check) 计数递增，通过归零，staled 判定不计数。计数达到 recipe 显式 `breakers` 中该 check `circuitBreaker` 键的上限且存在该 phase 的 gate-running run 时，run 停住并开 `recovery` 的 `breaker-tripped` item；触发记 `review-policy/breaker-tripped`。

## 不变式

`./invariant` 伴生插件在权威变更流上检查计数下限：熔断计数器永不持有负的连续失败计数。

## Model Experience

### 信任档调度与熔断停驻

#### 模型看到什么

不直接看到。档位变化改变的是向用户请求 B 类确认的时机，不是告知模型的内容；熔断触发表现为被停驻的 phase（恢复决策落地前不再有修复提示词）。

#### Token 影响

无。档位记录、计数器与 item 都是存储域写入，不在模型请求路径上。

#### KV Cache 影响

无。本包不新增、删除或重排任何提示词前缀。

## Known Limitations and Deferred Work

- **`balanced` 等同 `strict`。** 无校准差异；该档位保留，行为一致，直到校准冻结出差异。
- **熔断触发需要 gate-running run。** 无匹配 phase 的 gate-running run 时，熔断只记触发不开恢复 item——要停驻的 run 已不存在。

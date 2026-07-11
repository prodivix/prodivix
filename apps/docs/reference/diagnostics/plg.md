---
lastUpdated: false
---

# Plugin 错误码

Plugin 命名空间覆盖Plugin Manifest、contribution contract、权限、注册事务和 runtime lifecycle。

| Code                                          | 名称                                        | 严重程度  |
| --------------------------------------------- | ------------------------------------------- | --------- |
| [`PLG-1001`](/reference/diagnostics/plg-1001) | Manifest 源不是严格 UTF-8 JSON              | `error`   |
| [`PLG-1002`](/reference/diagnostics/plg-1002) | Manifest 包含重复对象键                     | `error`   |
| [`PLG-1003`](/reference/diagnostics/plg-1003) | 程序化输入不是 JSON value                   | `error`   |
| [`PLG-1004`](/reference/diagnostics/plg-1004) | Manifest 不符合 v1 Schema                   | `error`   |
| [`PLG-1005`](/reference/diagnostics/plg-1005) | Manifest 超出资源上限                       | `error`   |
| [`PLG-1010`](/reference/diagnostics/plg-1010) | Contribution 资源读取失败                   | `error`   |
| [`PLG-1011`](/reference/diagnostics/plg-1011) | Contribution 资源不是严格 JSON              | `error`   |
| [`PLG-1012`](/reference/diagnostics/plg-1012) | Contribution 资源完整性不匹配               | `error`   |
| [`PLG-1013`](/reference/diagnostics/plg-1013) | Contribution contract 不受支持              | `error`   |
| [`PLG-1014`](/reference/diagnostics/plg-1014) | Contribution descriptor 不符合 contract     | `error`   |
| [`PLG-1015`](/reference/diagnostics/plg-1015) | Contribution 资源超出上限                   | `error`   |
| [`PLG-2001`](/reference/diagnostics/plg-2001) | 插件版本不是有效 SemVer                     | `error`   |
| [`PLG-2002`](/reference/diagnostics/plg-2002) | Prodivix engine range 无效                  | `error`   |
| [`PLG-2003`](/reference/diagnostics/plg-2003) | 当前宿主版本不兼容                          | `error`   |
| [`PLG-2004`](/reference/diagnostics/plg-2004) | Publisher 与插件 scope 不一致               | `error`   |
| [`PLG-2010`](/reference/diagnostics/plg-2010) | Capability 重复声明                         | `error`   |
| [`PLG-2011`](/reference/diagnostics/plg-2011) | Contribution id 重复                        | `error`   |
| [`PLG-2012`](/reference/diagnostics/plg-2012) | Contribution 缺少注册能力                   | `error`   |
| [`PLG-2013`](/reference/diagnostics/plg-2013) | Activation 引用无效                         | `error`   |
| [`PLG-2014`](/reference/diagnostics/plg-2014) | Activation 缺少 runtime entrypoint          | `error`   |
| [`PLG-2015`](/reference/diagnostics/plg-2015) | 资源路径不可移植或发生冲突                  | `error`   |
| [`PLG-2016`](/reference/diagnostics/plg-2016) | UI entrypoint id 重复                       | `error`   |
| [`PLG-2020`](/reference/diagnostics/plg-2020) | Contribution 跨点引用无效                   | `error`   |
| [`PLG-2021`](/reference/diagnostics/plg-2021) | Contribution library owner 不一致           | `error`   |
| [`PLG-3001`](/reference/diagnostics/plg-3001) | Required capability 被拒绝                  | `error`   |
| [`PLG-3002`](/reference/diagnostics/plg-3002) | Capability policy 解析失败                  | `error`   |
| [`PLG-3010`](/reference/diagnostics/plg-3010) | Contribution identity 冲突                  | `error`   |
| [`PLG-3011`](/reference/diagnostics/plg-3011) | Registry transaction revision 冲突          | `error`   |
| [`PLG-3012`](/reference/diagnostics/plg-3012) | Contribution resolver 失败                  | `error`   |
| [`PLG-3013`](/reference/diagnostics/plg-3013) | Plugin owner generation 已过期              | `error`   |
| [`PLG-3014`](/reference/diagnostics/plg-3014) | Contribution contract 配置冲突              | `error`   |
| [`PLG-4001`](/reference/diagnostics/plg-4001) | Plugin Host 状态转换非法                    | `error`   |
| [`PLG-4002`](/reference/diagnostics/plg-4002) | Runtime activation 失败                     | `error`   |
| [`PLG-4003`](/reference/diagnostics/plg-4003) | Runtime 操作超时                            | `error`   |
| [`PLG-4004`](/reference/diagnostics/plg-4004) | Owner cleanup 不完整                        | `error`   |
| [`PLG-4005`](/reference/diagnostics/plg-4005) | Runtime transport 意外终止                  | `error`   |
| [`PLG-4006`](/reference/diagnostics/plg-4006) | Host operation 已被替代                     | `info`    |
| [`PLG-4007`](/reference/diagnostics/plg-4007) | Audit sink 不可用                           | `warning` |
| [`PLG-4008`](/reference/diagnostics/plg-4008) | Host subscriber 回调失败                    | `warning` |
| [`PLG-4010`](/reference/diagnostics/plg-4010) | Runtime artifact 读取失败                   | `error`   |
| [`PLG-4011`](/reference/diagnostics/plg-4011) | Runtime artifact 完整性不匹配               | `error`   |
| [`PLG-4012`](/reference/diagnostics/plg-4012) | Runtime artifact 超出上限                   | `error`   |
| [`PLG-4013`](/reference/diagnostics/plg-4013) | Sandbox bootstrap 失败                      | `error`   |
| [`PLG-4014`](/reference/diagnostics/plg-4014) | Sandbox handshake 不匹配                    | `error`   |
| [`PLG-4015`](/reference/diagnostics/plg-4015) | Sandbox policy 无效                         | `error`   |
| [`PLG-4020`](/reference/diagnostics/plg-4020) | Protocol message 非法                       | `error`   |
| [`PLG-4021`](/reference/diagnostics/plg-4021) | Protocol contract 未注册                    | `error`   |
| [`PLG-4022`](/reference/diagnostics/plg-4022) | Protocol sequence 非单调                    | `error`   |
| [`PLG-4023`](/reference/diagnostics/plg-4023) | Protocol correlation 非法                   | `error`   |
| [`PLG-4024`](/reference/diagnostics/plg-4024) | Protocol response 已迟到                    | `warning` |
| [`PLG-4025`](/reference/diagnostics/plg-4025) | Protocol request 超时                       | `error`   |
| [`PLG-4026`](/reference/diagnostics/plg-4026) | Protocol session 已关闭                     | `error`   |
| [`PLG-4030`](/reference/diagnostics/plg-4030) | Gateway capability 未在 Manifest 请求       | `error`   |
| [`PLG-4031`](/reference/diagnostics/plg-4031) | Gateway capability 当前被拒绝               | `error`   |
| [`PLG-4032`](/reference/diagnostics/plg-4032) | Gateway request 不符合 contract             | `error`   |
| [`PLG-4033`](/reference/diagnostics/plg-4033) | Gateway response 不符合 contract            | `error`   |
| [`PLG-4034`](/reference/diagnostics/plg-4034) | Gateway handler 不可用                      | `error`   |
| [`PLG-4035`](/reference/diagnostics/plg-4035) | Gateway request 超时                        | `error`   |
| [`PLG-4036`](/reference/diagnostics/plg-4036) | Gateway session 已过期                      | `error`   |
| [`PLG-4037`](/reference/diagnostics/plg-4037) | Gateway handler 执行失败                    | `error`   |
| [`PLG-4038`](/reference/diagnostics/plg-4038) | Gateway network policy 拒绝                 | `error`   |
| [`PLG-4039`](/reference/diagnostics/plg-4039) | Gateway request 被取消                      | `error`   |
| [`PLG-4040`](/reference/diagnostics/plg-4040) | Sandbox message quota 超限                  | `error`   |
| [`PLG-4041`](/reference/diagnostics/plg-4041) | Sandbox heartbeat 超时                      | `error`   |
| [`PLG-4042`](/reference/diagnostics/plg-4042) | Sandbox 已终止                              | `error`   |
| [`PLG-4043`](/reference/diagnostics/plg-4043) | Gateway quota 超限                          | `error`   |
| [`PLG-4050`](/reference/diagnostics/plg-4050) | Official host implementation 未通过构建证明 | `error`   |
| [`PLG-4051`](/reference/diagnostics/plg-4051) | Official host implementation 不存在         | `error`   |
| [`PLG-4052`](/reference/diagnostics/plg-4052) | Official host implementation 类型不匹配     | `error`   |
| [`PLG-4053`](/reference/diagnostics/plg-4053) | Official host implementation 绑定冲突       | `error`   |
| [`PLG-4060`](/reference/diagnostics/plg-4060) | Required Gateway audit 不可用               | `error`   |
| [`PLG-4061`](/reference/diagnostics/plg-4061) | Gateway outcome audit 写入失败              | `warning` |
| [`PLG-4070`](/reference/diagnostics/plg-4070) | Official component runtime 不可用           | `error`   |
| [`PLG-4071`](/reference/diagnostics/plg-4071) | Bundled official library 不存在             | `error`   |
| [`PLG-4072`](/reference/diagnostics/plg-4072) | Official component runtime 已不支持         | `error`   |

[返回错误码索引](/reference/diagnostic-codes)

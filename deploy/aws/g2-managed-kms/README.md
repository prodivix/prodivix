# G2 managed KMS reference stacks

这些模板只把可审查的安全边界写进仓库，本轮没有部署，也不会自行产生费用。创建 KMS key/replica
会持续计费；没有 AWS 账号、付款方式和明确预算时不要执行 `deploy`。

## 边界

- `primary-key.yml`创建symmetric key且不创建alias；active stack使用默认multi-Region模式，另一个独立stack可用
  `rotation-source-single-region`模式创建old rotation source。应用和Gate只接受exact ARN。
- `replica-key.yml` 必须在另一个 Region 部署，并引用 primary exact ARN；primary/replica 均使用
  `Retain` 与 30 天 deletion window。
- `github-oidc-role.yml` 不创建 account-level OIDC provider，避免覆盖共享资源；它要求现有 provider ARN、
  exact `aud=sts.amazonaws.com` 和 exact `sub`，不使用 repository wildcard。
- 参数约束拒绝 alias ARN、wildcard resource、非 GitHub OIDC provider，以及把 single-Region key 误传给 replica
  stack；手工触发的 live workflow 会在取得 AWS credential 前检查全部 protected Secret/Variable，缺项直接失败。
- role 只能对显式 ARN 执行 `Encrypt`、`Decrypt`、`DescribeKey`，没有 key management、IAM、Secrets Manager
  或数据库权限。
- GitHub `g2-managed-kms` Environment 仍必须配置 required reviewer、仅允许受保护分支，并保存 role ARN
  Secret 与 Region/key ARN Variables。

## 将来有账号时的顺序

1. 在primary Region以默认mode部署active `primary-key.yml`，记录active `PrimaryKeyArn`；用不同stack name与
   `KeyMode=rotation-source-single-region`再部署一次，记录old ARN。两把key都会计费。
2. 在replica Region部署`replica-key.yml`，传入active primary ARN，记录`ReplicaKeyArn`。
3. 使用已有 GitHub OIDC provider；把仓库实际的 exact Environment subject 传给 role stack。新仓库或已启用
   immutable subject 的仓库必须使用包含 owner/repository ID 的真实 `sub`，不要照抄旧格式。
4. 把 role output 存为 Environment Secret，把 Region 与 exact key ARN 存为 Environment Variables。
5. 手动运行 `G2 Managed KMS`；只有 live job 通过后才更新真实云 evidence 状态。

可先离线审查文件；`aws cloudformation validate-template` 也需要账号凭据，但不会创建 stack。真正部署前必须
先查看 change set 和预计费用。

# 快捷键

`Mod` 表示 macOS 的 `Command`，Windows/Linux 的 `Ctrl`。在文本或代码输入区内，原生编辑器撤销优先于 Workspace History。

## 项目导航

| 快捷键  | 表面                             |
| ------- | -------------------------------- |
| `Alt+1` | 项目首页                         |
| `Alt+2` | Blueprint                        |
| `Alt+3` | NodeGraph                        |
| `Alt+4` | Animation                        |
| `Alt+5` | Component                        |
| `Alt+C` | Code Workspace                   |
| `Alt+6` | Resources                        |
| `Alt+7` | Test（当前为后续能力入口）       |
| `Alt+8` | Export                           |
| `Alt+9` | Deployment（当前为后续能力入口） |
| `Alt+0` | Issues                           |

## Workspace History

| 快捷键        | 操作                                         |
| ------------- | -------------------------------------------- |
| `Mod+Z`       | 撤销当前文档/路由/Workspace 中最近可撤销操作 |
| `Mod+Shift+Z` | 重做                                         |
| `Ctrl+Y`      | Windows/Linux 重做                           |

History 快捷键不会截获正在编辑的文本输入。CodeMirror 等编辑器继续使用自己的文本历史；提交后的领域修改进入 Workspace History。

## Blueprint 画布

| 快捷键            | 操作 |
| ----------------- | ---- |
| `Mod++` / `Mod+=` | 放大 |
| `Mod+-`           | 缩小 |

画布需要获得焦点，输入控件中不会触发缩放。

## Resources 与 Code

| 快捷键   | 操作                                                            |
| -------- | --------------------------------------------------------------- |
| `F2`     | 重命名所选资源/文件，或对当前支持的代码符号发起 rename proposal |
| `Enter`  | 确认文件树重命名                                                |
| `Escape` | 取消文件树重命名或关闭当前临时交互                              |

`F2` 对代码符号只生成 revision-bound proposal；跨领域更新仍由 Workspace Transaction 应用。

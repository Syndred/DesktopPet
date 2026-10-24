原生精度观察与共享头像接入（2026-10-24）

实现fed3800；foundation f734775经合并d5f7c64接入。无全项目或生产发布成功声明。

native-standalone-58m.json：生产WindowsLocationAdapter确实返回过58米、OS/WiFi样本，checkFix通过；只保存坐标哈希。该诊断不是生产窗口收服。
native-window-177m.json：正式入口、真实原生定位，样本变成177米，互动被拦截。
native-watch.json：正式入口中的正常主动持续定位，在60秒界限内仍为313米，没有开始战斗或确认收服。实际进程已以失败结束并关闭；不是尚在进行的后台等待。未注入位置或结果，未修改80米要求。
physical-flow.mjs保留真正的正向入口，但本轮正向后半段没有执行到，不能据此宣称通过。真实位置截图仅在本机忽略目录，未提交。

portraits.json：共享resources.ResourcePortrait实际消费检查，六个canonical资源分别通过data-framing与实际ID断言，Pixi大角色仍正常。两张窗口截图展示新的头像近景与全身舞台。其位置明确标为受控测试样本，不计物理位置。
read-only-ledger.json：实际Electron/SQLite只读CLI核对此前受控位置保存的礼帽喵，收服、独立实例、记忆和战报各1；未修改原存档。账本validation为测试环境写入的local-os，来源仍以controlled/physicalLocationAcceptance:false明确限定，不能用它证明真实系统位置收服。
cloud-readonly.json：无凭据Node fetch OPTIONS探测，未取得可用响应，错误UND_ERR_SOCKET；未配置discovery HTTPS，也未验证部署版本。它不等价于Electron代理网络的HTTP状态，更不代表已完成云端联调。

本轮只复查头像、编译及原生定位门槛；没有重复受控位置的整场收服、全量项目或安装包验收。原始失败图、既有历史、用户数据和生产服务保持原状。

# WOO虎 FFmpeg 合成服务

`woo-ffmpeg-render-4` 是独立、无模型调用的合成服务。目前只在本地通过合成素材技术验收，尚未部署到持久服务器。工作台提交、原请求查询、R2归档、人审和下载接口已实现并通过模拟服务联调；未配置真实连接时继续 blocked，交付镜头资源包。本地测试 MP4 不能作为活动成片。

运行条件：Python 3、FFmpeg/ffprobe（本次实测6.1.1，需libx264/AAC/libass）、持久磁盘、单个服务进程。生产需HTTPS反向代理及上传大小/超时限制。默认仅监听127.0.0.1；至少32字符的窄范围 `WOO_RENDERER_TOKEN` 由运行环境注入，不能进入Git、URL、日志或资源包。

```sh
python services/render-worker/server.py --data-dir /var/lib/woo-renderer --host 127.0.0.1 --port 8080
```

数据目录保留SQLite任务、资源、逐镜缓存、阶段日志和输出。同一目录仅运行一个进程；重启将rendering恢复为queued继续确定性处理，不调用模型；worker版本不符的旧任务不能作为新版本产物。

全部接口要求 `Authorization: Bearer <运行环境token>`，响应不缓存：

| 接口 | 行为 |
| --- | --- |
| POST `/jobs` | body为镜头资源ZIP，最多200MiB，返回202及确定性任务ID；同输入返回原任务 |
| GET `/jobs/{id}?project_id={project}` | 持久状态和元数据，项目不符返回404 |
| GET `/jobs/{id}/file?project_id={project}` | 仅succeeded可下载，核验实际MP4 SHA-256 |
| GET `/jobs/{id}/cover?project_id={project}` | 下载固定帧与批准封面文字生成的JPEG，核验SHA |
| GET `/requests/{request_id}?project_id={project}` | 依据提交时的`X-WOO-Request-ID`恢复任务，不重投未知提交 |

校验ZIP路径/大小、素材SHA、许可说明、来源起点、脚本/方案快照、总时长、字幕时序和固定字体；只读包内媒体，不获取外部URL。此token面向受信任工作台服务器；包内consent/approved声明不能独立证明真实授权。

静态图可按镜头时长保持静态，或选择确定性缓慢放大；片段时长不足阻塞。混合镜头、旁白与音乐、SRT同步，使用包内WOO Noto CJK SC常用中文子集及OFL。输出H.264/AAC、1080×1920、30fps；检查音轨和30±0.5秒，黑帧检测仅作报告，最终仍需人工审音画。逐镜缓存包含输入/产物SHA，替换一镜只重算该镜。归档输出、1/15/29秒帧和技术元数据。

工作台每5分钟按公平队列查询原合成任务，校验项目、脚本/方案版本、worker版本、输入包/manifest SHA，取回MP4和封面并私有归档。审批只针对当前归档版本；脚本或方案改变阻止旧成片被批准或纳入正式包。

上线需要设置服务端运行变量：`WOO_RENDERER_URL`（HTTPS服务根地址）、`WOO_RENDERER_TOKEN`（与合成服务相同的32字符以上token）、`WOO_RENDERER_VERIFIED`（实际联调后设1；当前未设）。不要把token写入代码、镜头包或浏览器。Dockerfile提供CPU容器启动模板，持久卷挂`/data`，外部HTTPS反向代理负责入口；容器模板尚未实际构建验证，不能用本地测试替代持久服务部署。

方案支持静态图保持/缓慢放大、直接切换或每镜头0.15秒淡入淡出，总时长不额外减少。中文封面文字与最后1–5秒片尾使用已校验字体和安全区；长文字/缺失字形阻塞，不截断。字幕由批准脚本提取时码后仍需逐句校对，与真实录音同步由人审确认。配音和音乐可上传，不要求购买TTS。

验证命令：`python scripts/verify-render-worker.py`。本地实际HTTP提交/查询/下载生成30.0秒竖屏MP4，有音轨及中文字幕；重投幂等，替换一镜五镜复用，越权被拒。全部素材和音轨为测试信号，0模型调用；证据 `docs/v3/evidence/render-worker-local-synthetic.json`。

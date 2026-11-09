# 《Petit pollen》配乐素材

本游戏的原创三拍器乐曲。Hohner 按钮手风琴演奏主题，尼龙弦吉他从扫弦切换为独奏，拨奏低音提琴为乐句收尾。成品是使用真实乐器单音录音重新编曲、分轨摆位和混音的立体声录音。

| 乐器 | 录音来源及授权 |
| --- | --- |
| Hohner 按钮手风琴 | Jeff Stauffer 于 2023 年录制，michael02022 整理音色，Piotr Barz 协助提供录音。[FreePats Button Accordion HN，2024-03-29，CC0](https://freepats.zenvoid.org/Organ/accordion.html) |
| 西班牙古典吉他 | Roberto 于 2008 年用 AKG Perception 120 录制。[FreePats Spanish Classical Guitar，2019-06-18，CC0](https://freepats.zenvoid.org/Guitar/acoustic-guitar.html) |
| 拨奏低音提琴 | Versilian Studios Chamber Orchestra 2 Community Edition，Solo Contrabass / Pizz 的轻奏力度和轮替录音。[官方授权说明](https://versilian-studios.com/vsco-community/) · [采样目录](https://github.com/sgossner/VSCO-2-CE/tree/master/Strings/Solo%20Contrabass/Pizz) |

三个采样库均采用 [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/)。

## 重做成品

乐谱保存在 `petit-pollen-score.json`。每个小节开头是和弦名，后面的数对表示 MIDI 音高和拍数，音高 0 表示休止。速度、吉他独奏、风箱连奏、上行装饰音和收尾的呼吸处理在 `render-chanson.py` 内。

安装 Python、NumPy、SciPy 和 lameenc。把 FreePats 发布的两个 SFZ/WAV 包解压到同一素材目录，在该目录下的 `contrabass` 文件夹放入上表所列的 VSCO 录音。本次渲染使用文件名按字母排序的前 28 个 WAV 中的 `v1_rr*` 录音；其余音区用邻近的真实采样移调。运行以下命令即可再生成音乐。项目的离线包只需要最终 MP3。

```shell
python music/render-chanson.py PATH_TO_SAMPLE_BANKS petit-pollen.mp3
```

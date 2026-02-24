import json

from bilibili_api import user
from bilibili_api.user import MedialistOrder
from bilibili_api.utils.network import Credential
import asyncio
import argparse
import re


def sanitize_filename(filename):
    # 移除或替换文件名中的非法字符
    return re.sub(r'[\\/:*?"<>|]', "", filename)


async def main():
    # 解析命令行参数
    parser = argparse.ArgumentParser(description="获取B站UP主音乐分区视频BV号")
    parser.add_argument("--uid", type=int, help="UP主的UID")
    args = parser.parse_args()

    # 如果没有传入uid，让用户输入
    if args.uid is None:
        while True:
            try:
                uid_input = input("请输入UP主的UID: ")
                uid = int(uid_input)
                break
            except ValueError:
                print("请输入有效的数字UID")
    else:
        uid = args.uid

    # 初始化用户对象，使用空的Credential
    credential = Credential()
    u = user.User(uid, credential=credential)

    # 获取UP主信息，获取名字
    up_name = f"up_{uid}"
    try:
        user_info = await u.get_user_info()
        if "name" in user_info:
            up_name = user_info["name"]
    except Exception as e:
        print(f"获取UP主信息失败: {e}")

    # 获取投稿视频列表
    videos = []
    oid = None
    page_count = 0
    max_pages = 100000  # 限制最大页数，避免无限循环

    data_file = "data.json"
    # 运行爬虫前的初始化：清空文件
    with open(data_file, "w", encoding="utf-8") as f:
        pass  # 打开即清空，什么都不用写

    while page_count < max_pages:
        try:
            # 使用get_media_list方法
            video_list = await u.get_media_list(
                oid=oid,
                ps=30,
                direction=False,
                desc=True,
                sort_field=MedialistOrder.PUBDATE,
                tid=0,
                with_current=False,
            )

            # 打印API返回的结构，以便调试
            print(f"API返回结构的键: {list(video_list.keys())}")
            with open(data_file, "a", encoding="utf-8") as f:
                f.write(json.dumps(video_list, ensure_ascii=False) + "\n")

            # 检查是否有视频
            if "media_list" not in video_list or not video_list["media_list"]:
                break

            # 打印视频列表的基本信息，以便调试
            print(f"当前页视频数量: {len(video_list['media_list'])}")

            # 遍历所有视频，打印信息
            for i, v in enumerate(video_list["media_list"]):
                print(
                    f"视频{i + 1}: 标题={v.get('title', '无标题')}, UP主ID={v.get('upper', {}).get('mid', '无ID')}, 分区ID={v.get('tid', '无分区')}, BV号={v.get('bv_id', '无BV号')}"
                )
                # 检查是否是目标UP主的视频
                # if v.get("upper", {}).get("mid") == uid:
                # 检查是否是音乐分区的视频
                if v.get("tid") in [27, 28, 31]:  # 28是音乐分区的tid
                    # 使用bv_id字段获取BV号
                    if "bv_id" in v:
                        # 提取标题
                        title = ""
                        video_title = v.get("title", "")
                        # 尝试从《》【】...中提取标题
                        for l, r in [
                            ("《", "》"),
                            ("【", "】"),
                            ("〖", "〗"),
                            ("『", "』"),
                            ("「", "」"),
                        ]:
                            s, e = video_title.find(l), video_title.find(r)
                            if s < e != -1:
                                title = video_title[s + 1 : e]
                                break
                        title = video_title if not title or title in up_name else title
                        # 添加到视频列表
                        videos.append((v["bv_id"], title))

            # 获取下一页的oid
            if "has_more" in video_list and video_list["has_more"]:
                # 使用'id'字段而不是'aid'字段
                oid = video_list["media_list"][-1]["id"]
                page_count += 1
                # 添加延迟，避免请求过于频繁
                await asyncio.sleep(1)
            else:
                break
        except Exception as e:
            print(f"获取视频列表失败: {e}")
            break

    # 清理文件名中的非法字符
    safe_up_name = sanitize_filename(up_name)
    filename = f"{safe_up_name}.txt"

    # 保存BV号和标题到文件
    with open(filename, "w", encoding="utf-8") as f:
        for bvid, title in videos:
            f.write(f"{bvid}, {title}\n")

    print(f"已保存 {len(videos)} 个音乐分区视频的BV号和标题到 {filename}")


if __name__ == "__main__":
    asyncio.run(main())

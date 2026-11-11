class MMCGComicSource extends ComicSource {
    name = "18H.mm-cg.com";
    key = "mmcg18h";
    version = "1.0.0";
    minAppVersion = "1.0.0";
    url = "";

    /**
     * 解析漫画列表 HTML，返回 Comic 数组
     */
    parseComicList(html) {
        const doc = new HtmlDocument(html);
        const posts = doc.querySelectorAll(".post");
        const comics = [];
        for (const post of posts) {
            const a = post.querySelector("a");
            const img = post.querySelector("img.thumb");
            const titleEl = post.querySelector("h3 a");
            if (!a || !titleEl) continue;
            const href = a.attributes['href'] || '';
            const idMatch = href.match(/(?:18H_content|doujin_content)\/(\d+)\/content\.html/);
            if (!idMatch) continue;
            const id = idMatch[1];
            const title = titleEl.text.trim();
            const cover = img ? (img.attributes['src'] || '') : '';
            comics.push(new Comic({
                id: id,
                title: title,
                cover: cover,
            }));
        }
        doc.dispose();
        return comics;
    }

    /**
     * 从分页区域提取最大页码
     */
    parseMaxPage(html) {
        const doc = new HtmlDocument(html);
        const pageLinks = doc.querySelectorAll(".pagination-row a");
        let maxPage = 1;
        for (const link of pageLinks) {
            const href = link.attributes['href'] || '';
            const match = href.match(/\/(\d+)\.html$/);
            if (match) {
                const p = parseInt(match[1]);
                if (p > maxPage) maxPage = p;
            }
        }
        doc.dispose();
        return maxPage;
    }

    /**
     * 请求列表页并解析漫画和下一页链接
     */
    async fetchAndParseList(url) {
        const res = await Network.get(url, {});
        if (res.status !== 200) {
            throw new Error(`请求失败: ${url}`);
        }
        const html = res.body;
        const comics = this.parseComicList(html);
        const maxPage = this.parseMaxPage(html);
        const pageMatch = url.match(/\/(\d+)\.html$/);
        let currentPage = pageMatch ? parseInt(pageMatch[1]) : 1;
        let next = null;
        if (currentPage < maxPage) {
            next = url.replace(/\/(\d+)\.html$/, `/${currentPage + 1}.html`);
        }
        return { comics, next };
    }

    /**
     * 从详情页 HTML 提取 Large_cgurl 图片数组
     */
    extractImages(html) {
        const images = [];
        const regex = /Large_cgurl\[(\d+)\]\s*=\s*"([^"]+)";/g;
        let match;
        const map = {};
        while ((match = regex.exec(html)) !== null) {
            map[parseInt(match[1])] = match[2];
        }
        const keys = Object.keys(map).map(Number).sort((a, b) => a - b);
        for (const k of keys) {
            images.push(map[k]);
        }
        return images;
    }

    /**
     * 并行尝试两个可能的详情页 URL，优先返回包含图片数组的响应
     */
    async fetchComicDetailHtml(id) {
        const urls = [
            `https://18h.mm-cg.com/zh/18H_content/${id}/content.html`,
            `https://18h.mm-cg.com/zh/doujin_content/${id}/content.html`
        ];
        const results = await Promise.allSettled(urls.map(url => Network.get(url, {})));
        let fallback = null;
        for (let i = 0; i < results.length; i++) {
            const r = results[i];
            if (r.status === 'fulfilled' && r.value.status === 200) {
                const html = r.value.body;
                const images = this.extractImages(html);
                if (images.length > 0) {
                    return { html, images };
                }
                if (!fallback) {
                    fallback = { html, images };
                }
            }
        }
        if (fallback) return fallback;
        throw new Error(`无法加载漫画详情: ${id}`);
    }

    // ==================== 探索页 ====================
    explore = [
        {
            title: "18H.mm-cg.com",
            type: "multiPartPage",
            load: async () => {
                const [longRes, shortRes] = await Promise.all([
                    this.fetchAndParseList("https://18h.mm-cg.com/zh/18H_list/all/1.html"),
                    this.fetchAndParseList("https://18h.mm-cg.com/zh/doujin_list/all/1.html")
                ]);
                return [
                    {
                        title: "18H漫畫",
                        comics: longRes.comics,
                        viewMore: "category:18H漫畫@18H_list"
                    },
                    {
                        title: "18H短篇同人",
                        comics: shortRes.comics,
                        viewMore: "category:18H短篇同人@doujin_list"
                    }
                ];
            }
        }
    ];

    // ==================== 分类页 ====================
    category = {
        title: "18H.mm-cg.com",
        parts: [
            {
                name: "18H漫畫",
                type: "fixed",
                categories: ["隨機", "列表"],
                itemType: "category",
                categoryParams: ["18H_random", "18H_list"],
            },
            {
                name: "18H短篇同人",
                type: "fixed",
                categories: ["隨機", "列表"],
                itemType: "category",
                categoryParams: ["doujin_random", "doujin_list"],
            }
        ],
        enableRankingPage: false,
    };

    // ==================== 分类漫画加载 ====================
    categoryComics = {
        load: async (category, param, options, page) => {
            let type = param.startsWith("doujin") ? "doujin" : "18H";
            let mode = "list";
            if (options && options.length > 0 && options[0]) {
                mode = options[0];
            } else if (param.includes("_random")) {
                mode = "random";
            } else if (param.includes("_list")) {
                mode = "list";
            }

            if (mode === "random") {
                const url = `https://18h.mm-cg.com/zh/${type}_random/all/index.html`;
                const res = await Network.get(url, {});
                if (res.status !== 200) throw new Error(`请求失败: ${url}`);
                const html = res.body;
                const comics = this.parseComicList(html);
                return { comics, maxPage: 1 };
            } else {
                const url = `https://18h.mm-cg.com/zh/${type}_list/all/${page}.html`;
                const res = await Network.get(url, {});
                if (res.status !== 200) throw new Error(`请求失败: ${url}`);
                const html = res.body;
                const comics = this.parseComicList(html);
                const maxPage = this.parseMaxPage(html);
                return { comics, maxPage };
            }
        },
        optionList: [
            {
                type: "select",
                label: "模式",
                options: [
                    "list-列表",
                    "random-隨機"
                ],
                default: "list",
            }
        ],
        ranking: null,
    };

    // ==================== 搜索 ====================
    search = {
        load: async (keyword, options, page) => {
            let searchType = "18H";
            if (options && options.length > 0 && options[0]) {
                searchType = options[0];
            }
            const url = `https://18h.mm-cg.com/zh/${searchType}_search/all/${encodeURIComponent(keyword)}/${page}.html`;
            const res = await Network.get(url, {});
            if (res.status !== 200) throw new Error(`请求失败: ${url}`);
            const html = res.body;
            const comics = this.parseComicList(html);
            const maxPage = this.parseMaxPage(html);
            return { comics, maxPage };
        },
        optionList: [
            {
                type: "select",
                label: "類型",
                options: [
                    "18H-18H長篇",
                    "doujin-18H短篇"
                ],
                default: "18H",
            }
        ],
        enableTagsSuggestions: false,
        onTagSuggestionSelected: null,
    };

    // ==================== 漫画详情 ====================
    comic = {
        loadInfo: async (id) => {
            const { html, images } = await this.fetchComicDetailHtml(id);
            const doc = new HtmlDocument(html);
            const titleEl = doc.querySelector(".archive-title h1");
            const title = titleEl ? titleEl.text.trim() : `漫畫 ${id}`;
            doc.dispose();

            const cover = images.length > 0 ? images[0] : '';
            const chapters = { "1": title };

            return new ComicDetails({
                id: id,
                title: title,
                cover: cover,
                chapters: chapters,
                tags: {},   // 提供空对象避免解析错误
            });
        },
        loadEp: async (comicId, epId) => {
            const { images } = await this.fetchComicDetailHtml(comicId);
            return { images };
        },
        idMatch: "(?:18H_content|doujin_content)/(\\d+)/content\\.html",
        loadThumbnails: null,
    };
}
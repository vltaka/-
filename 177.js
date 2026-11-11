class ManHua177 extends ComicSource {
    name = "177漫画"
    key = "manhua177"
    version = "1.1.3"
    minAppVersion = "1.0.0"
    url = "https://www.177picyy.com/"

    // 辅助函数：从 URL 提取漫画数字 ID(备用)
    extractId = (url) => {
        const match = url.match(/\/(\d+)\.html/);
        return match ? match[1] : url;
    }

    // 辅助函数：将相对链接转为绝对链接
    resolveUrl = (href, baseUrl) => {
        if (!href) return null;
        if (href.startsWith("http://") || href.startsWith("https://")) return href;
        if (href.startsWith("/")) {
            const domain = baseUrl.match(/^(https?:\/\/[^\/]+)/)[1];
            return domain + href;
        } else {
            let base = baseUrl;
            if (!base.endsWith("/")) base = base.substring(0, base.lastIndexOf("/") + 1);
            return base + href;
        }
    }

    // 从文档中提取最大页码(用于分类/搜索列表)
    extractMaxPageFromDoc = (doc, currentPage = 1) => {
        let max = 1;
        const allLinks = doc.querySelectorAll("a");
        for (const a of allLinks) {
            const href = a.attributes['href'];
            if (!href) continue;
            const match1 = href.match(/\/page\/(\d+)\//);
            if (match1) max = Math.max(max, parseInt(match1[1]));
            const match2 = href.match(/[?&]page=(\d+)/);
            if (match2) max = Math.max(max, parseInt(match2[1]));
        }
        if (max === 1) {
            const containers = doc.querySelectorAll(
                "nav.pagination, div.pagination, div.wp-pagenavi, div.nav-links, div.page-links, div.pagenavi, .pagination, .nav-links"
            );
            for (const container of containers) {
                const candidates = container.querySelectorAll("a, span, li");
                for (const el of candidates) {
                    const txt = el.text.trim();
                    if (/^\d+$/.test(txt)) max = Math.max(max, parseInt(txt));
                }
            }
        }
        if (max === 1 && currentPage > 1) max = currentPage;
        return max;
    }

    // 解析漫画列表(分类/搜索/发现)，返回 {comics, next, maxPage}
    parseComicList = (html, baseUrl) => {
        const doc = new HtmlDocument(html);
        const comics = [];
        let articles = doc.querySelectorAll("article.picture, article.post, article");
        if (articles.length === 0) articles = doc.querySelectorAll(".picture-box");
        for (const article of articles) {
            let titleEl = article.querySelector("h2.grid-title a");
            if (!titleEl) titleEl = article.querySelector("h2 a");
            if (!titleEl) titleEl = article.querySelector("a[rel='bookmark']");
            let imgEl = article.querySelector("figure.picture-img img");
            if (!imgEl) imgEl = article.querySelector("img");
            const linkEl = titleEl;
            if (!titleEl || !linkEl) continue;
            const title = titleEl.text.trim();
            const href = linkEl.attributes['href'] || "";
            if (!href) continue;
            const id = this.resolveUrl(href, baseUrl) || href;
            let cover = "";
            if (imgEl) {
                cover = imgEl.attributes['data-lazy-src'] || imgEl.attributes['data-src'] || imgEl.attributes['src'] || "";
                const srcMatch = cover.match(/src=([^&]+)/);
                if (srcMatch) cover = decodeURIComponent(srcMatch[1]);
                if (cover.startsWith("data:")) cover = "";
            }
            const catEl = article.querySelector(".g-cat a, .single-cat a, a[rel='category tag']");
            const category = catEl ? catEl.text.trim() : "";
            const dateEl = article.querySelector(".date, time");
            const date = dateEl ? dateEl.text.trim().replace(/\s+/g, ' ') : "";
            const comic = new Comic({
                id: id,
                title: title,
                cover: cover,
                subtitle: category + " " + date,
                tags: category ? [category] : [],
                description: "",
            });
            comics.push(comic);
        }

        const docNav = doc.querySelector("nav.pagination");
        let next = null;
        if (docNav) {
            const nextEl = docNav.querySelector("a.next");
            if (nextEl) {
                const nextHref = nextEl.attributes['href'];
                if (nextHref) next = this.resolveUrl(nextHref, baseUrl);
            }
        }

        let currentPage = 1;
        const pageMatch = baseUrl.match(/\/page\/(\d+)\//);
        if (pageMatch) currentPage = parseInt(pageMatch[1]);
        const pageQueryMatch = baseUrl.match(/[?&]page=(\d+)/);
        if (pageQueryMatch) currentPage = parseInt(pageQueryMatch[1]);

        let maxPage = this.extractMaxPageFromDoc(doc, currentPage);
        if (maxPage <= currentPage && next) maxPage = currentPage + 1;
        return { comics, next, maxPage };
    }

    // 发现页(并行加载所有分类，加快速度)
    explore = [
        {
            title: "177漫画",
            type: "multiPartPage",
            load: async (page) => {
                const categories = [
                    { title: "中文成人H漫画", url: "https://www.177picyy.com/html/category/tt/", param: "tt" },
                    { title: "全彩CG(中文全彩)", url: "https://www.177picyy.com/html/category/cg/cg-cn/", param: "cg-cn" },
                    { title: "全彩CG(纯图无字)", url: "https://www.177picyy.com/html/category/cg/cg-no/", param: "cg-no" },
                    { title: "全彩CG(日文全彩)", url: "https://www.177picyy.com/html/category/cg/cg-jp/", param: "cg-jp" },
                    { title: "日文成人H漫画", url: "https://www.177picyy.com/html/category/jj/", param: "jj" },
                    { title: "全彩CG", url: "https://www.177picyy.com/html/category/cg/", param: "cg" }
                ];

                // 并行请求所有分类
                const results = await Promise.all(categories.map(async (cat) => {
                    try {
                        const res = await Network.get(cat.url, {});
                        const html = res.body;
                        const parsed = this.parseComicList(html, cat.url);
                        return {
                            title: cat.title,
                            comics: parsed.comics,
                            viewMore: `category:${cat.title}@${cat.param}`
                        };
                    } catch (e) {
                        console.error(`Failed to load ${cat.title}: ${e}`);
                        return {
                            title: cat.title,
                            comics: [],
                            viewMore: `category:${cat.title}@${cat.param}`
                        };
                    }
                }));

                return results;
            }
        }
    ];

    // 分类页面配置
    category = {
        title: "177漫画",
        parts: [
            {
                name: "漫画分类",
                type: "fixed",
                categories: ["中文成人H漫画", "日文成人H漫画", "全彩CG", "全彩CG(中文全彩)", "全彩CG(日文全彩)", "全彩CG(纯图无字)"],
                itemType: "category",
                categoryParams: ["tt", "jj", "cg", "cg-cn", "cg-jp", "cg-no"]
            }
        ],
        enableRankingPage: false
    };

    // 分类漫画加载
    categoryComics = {
        load: async (category, param, options, page) => {
            let baseUrl;
            if (param === "cg-cn" || param === "cg-jp" || param === "cg-no") {
                baseUrl = `https://www.177picyy.com/html/category/cg/${param}/`;
            } else {
                baseUrl = `https://www.177picyy.com/html/category/${param}/`;
            }
            let url = baseUrl;
            if (page && page > 1) url = `${baseUrl}page/${page}/`;
            const res = await Network.get(url, {});
            const html = res.body;
            const result = this.parseComicList(html, url);
            return { comics: result.comics, maxPage: result.maxPage };
        },
        loadNext: async (category, param, options, next) => {
            let baseUrl;
            if (param === "cg-cn" || param === "cg-jp" || param === "cg-no") {
                baseUrl = `https://www.177picyy.com/html/category/cg/${param}/`;
            } else {
                baseUrl = `https://www.177picyy.com/html/category/${param}/`;
            }
            const url = next || baseUrl;
            const res = await Network.get(url, {});
            return this.parseComicList(res.body, url);
        },
        optionList: []
    };

    // 搜索功能
    search = {
        load: async (keyword, options, page) => {
            const baseUrl = `https://www.177picyy.com/?s=${encodeURIComponent(keyword)}`;
            let url = baseUrl;
            if (page && page > 1) url = `https://www.177picyy.com/page/${page}/?s=${encodeURIComponent(keyword)}`;
            const res = await Network.get(url, {});
            const html = res.body;
            const result = this.parseComicList(html, url);
            return { comics: result.comics, maxPage: result.maxPage };
        },
        loadNext: async (keyword, options, next) => {
            const baseUrl = `https://www.177picyy.com/?s=${encodeURIComponent(keyword)}`;
            const url = next || baseUrl;
            const res = await Network.get(url, {});
            return this.parseComicList(res.body, url);
        },
        optionList: [],
        enableTagsSuggestions: false,
        onTagSuggestionSelected: null
    };

    // 漫画详情
    comic = {
        idMatch: "(https?://www\\.177picyy\\.com/html/\\d{4}/\\d{2}/\\d+\\.html)",

        loadInfo: async (id) => {
            const res = await Network.get(id, {});
            if (!res.body) throw new Error("Failed to load comic info");
            const doc = new HtmlDocument(res.body);

            const titleEl = doc.querySelector("h1.entry-title");
            const title = titleEl ? titleEl.text.trim() : "未知标题";

            let cover = "";
            const firstImg = doc.querySelector(".single-content img");
            if (firstImg) {
                cover = firstImg.attributes['data-lazy-src'] || firstImg.attributes['src'] || "";
                if (cover.startsWith("data:")) cover = "";
            }

            const catEl = doc.querySelector(".single-cat a");
            const cat = catEl ? catEl.text.trim() : "";

            const tags = {};
            const chapters = {};
            chapters[id] = "第1话";

            // 从分页链接 href 中提取最大页码(用于描述)
            let pageCount = 1;
            const pageLinkEls = doc.querySelectorAll(".page-links a");
            for (const a of pageLinkEls) {
                const href = a.attributes['href'];
                if (!href) continue;
                const match = href.match(/\/(\d+)\/?$/);
                if (match) pageCount = Math.max(pageCount, parseInt(match[1]));
            }
            const description = `分类：${cat} | 共${pageCount}页`;

            return new ComicDetails({
                title: title,
                cover: cover,
                description: description,
                tags: tags,
                chapters: chapters,
                isFavorite: null,
                recommend: [],
            });
        },

        loadThumbnails: null,

        loadEp: async (comicId, epId) => {
            const detailUrl = epId || comicId;
            const firstRes = await Network.get(detailUrl, {});
            if (!firstRes.body) return { images: [] };
            const firstDoc = new HtmlDocument(firstRes.body);
            const allImages = [];

            // 提取第一页图片
            const firstImgs = firstDoc.querySelectorAll(".single-content img");
            for (const img of firstImgs) {
                const src = img.attributes['data-lazy-src'] || img.attributes['src'] || "";
                if (src && !src.startsWith("data:")) allImages.push(src);
            }

            // 收集所有分页链接(排除当前页)
            const pageLinkEls = firstDoc.querySelectorAll(".page-links a");
            const pageUrls = [];
            const seen = new Set();
            for (const a of pageLinkEls) {
                const href = a.attributes['href'];
                if (!href) continue;
                const absUrl = this.resolveUrl(href, detailUrl);
                if (absUrl && !seen.has(absUrl)) {
                    seen.add(absUrl);
                    if (absUrl !== detailUrl) {
                        pageUrls.push(absUrl);
                    }
                }
            }

            // 并行请求所有剩余页面
            const pageImagePromises = pageUrls.map(async (url) => {
                try {
                    const res = await Network.get(url, {});
                    if (!res.body) return [];
                    const doc = new HtmlDocument(res.body);
                    const imgs = doc.querySelectorAll(".single-content img");
                    const images = [];
                    for (const img of imgs) {
                        const src = img.attributes['data-lazy-src'] || img.attributes['src'] || "";
                        if (src && !src.startsWith("data:")) images.push(src);
                    }
                    return images;
                } catch (e) {
                    return [];
                }
            });

            const pagesImages = await Promise.all(pageImagePromises);
            for (const imgs of pagesImages) {
                allImages.push(...imgs);
            }

            return { images: allImages };
        },

        onImageLoad: (url, comicId, epId) => {
            return {};
        }
    };
}

// 注册源
ComicSource.sources["manhua177"] = ManHua177;
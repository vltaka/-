/** @type {import('./_venera_.js')} */

/**
 * 巴卡漫画 bakamh.com
 * Madara / WP-Manga 主题
 */
class Bakamh extends ComicSource {
    name = "巴卡漫画"
    key = "bakamh"
    version = "1.0.0"
    minAppVersion = "1.6.0"
    url = ""

    static defaultUa =
        "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36"

    static defaultDomains = [
        "https://bakamh.com",
    ]

    get domain() {
        let d = this.loadSetting("domain") || this.loadData("bakamh_domain") || Bakamh.defaultDomains[0]
        return String(d).replace(/\/$/, "")
    }

    get ua() {
        return this.loadSetting("ua") || Bakamh.defaultUa
    }

    get headers() {
        return {
            "User-Agent": this.ua,
            "Referer": this.domain + "/",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        }
    }

    get imgHeaders() {
        return {
            "User-Agent": this.ua,
            "Referer": this.domain + "/",
            "Accept": "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
            "Pragma": "no-cache",
        }
    }

    buildUrl(path) {
        if (!path) return this.domain
        if (path.indexOf("http") === 0) return path
        return this.domain + (path.indexOf("/") === 0 ? path : "/" + path)
    }

    // ---------- 账号：WebView 登录 ----------
    account = {
        loginWithWebview: {
            get url() {
                return "https://bakamh.com/bmpcc/?redirect_to=https%3A%2F%2Fbakamh.com%2F"
            },
            checkStatus: (url, title) => {
                if (!url) return false
                // 离开登录页且不在 action=login/register 即视为成功
                if (url.indexOf("bmpcc") >= 0 && (url.indexOf("action=login") >= 0 || url.indexOf("action=register") >= 0)) {
                    return false
                }
                if (url.indexOf("bakamh.com") >= 0 && url.indexOf("bmpcc") < 0) {
                    return true
                }
                return false
            },
            onLoginSuccess: () => {},
        },
        logout: () => {
            try { Network.deleteCookies(this.domain) } catch (e) {}
            try { Network.deleteCookies("https://bakamh.com") } catch (e) {}
        },
        registerWebsite: "https://bakamh.com/bmpcc/?action=register",
    }

    attr(el, name) {
        if (!el || !el.attributes) return ""
        return el.attributes[name] || el.attributes[name.toLowerCase()] || ""
    }

    absUrl(u) {
        if (!u) return ""
        u = String(u).trim()
        if (!u || u.indexOf("data:") === 0) return ""
        if (u.indexOf("//") === 0) u = "https:" + u
        if (u.indexOf("http") !== 0) u = this.buildUrl(u)
        return u
    }

    // 从列表卡片解析
    parseListItem(el) {
        let link =
            el.querySelector("h3 a") ||
            el.querySelector("h5 a") ||
            el.querySelector(".post-title a") ||
            el.querySelector(".manga-title a") ||
            el.querySelector("a")
        let href = this.attr(link, "href") || ""
        // id = /manga/{slug}/ 中的 slug
        let id = ""
        let m = href.match(/\/manga\/([^\/\#\?]+)\/?/)
        if (m) id = decodeURIComponent(m[1])
        if (!id) return null

        let img =
            el.querySelector("img") ||
            (link ? link.querySelector("img") : null)
        let cover =
            this.attr(img, "data-src") ||
            this.attr(img, "data-lazy-src") ||
            this.attr(img, "data-original") ||
            this.attr(img, "src") ||
            ""
        // 去掉尺寸参数
        cover = cover.replace(/-\d+x\d+(\.\w+)$/, "$1")

        let title =
            (link && link.text ? String(link.text).trim() : "") ||
            this.attr(link, "title") ||
            this.attr(img, "alt") ||
            id

        let sub = ""
        let chapterEl =
            el.querySelector(".chapter-item a") ||
            el.querySelector(".list-chapter a") ||
            el.querySelector(".chapter a")
        if (chapterEl && chapterEl.text) sub = String(chapterEl.text).trim()

        return {
            id: id,
            title: title,
            cover: this.absUrl(cover),
            subTitle: sub,
        }
    }

    parseComicsFromDoc(doc) {
        let comics = []
        let seen = {}
        let selectors = [
            "div.page-item-detail",
            "div.page-listing-item",
            ".manga-item",
            ".row.c-tabs-item__content",
            "div.col-6.col-md-3",
            ".c-tabs-item",
        ]
        let els = []
        for (let i = 0; i < selectors.length; i++) {
            els = doc.querySelectorAll(selectors[i]) || []
            if (els && els.length) break
        }
        // 兜底：所有指向 /manga/ 的链接
        if (!els || els.length === 0) {
            let links = doc.querySelectorAll("a[href*='/manga/']") || []
            for (let i = 0; i < links.length; i++) {
                let a = links[i]
                let href = this.attr(a, "href") || ""
                if (!href.match(/\/manga\/[^\/]+\/?$/)) continue
                let parent = a
                let item = this.parseListItem(parent)
                if (item && item.id && !seen[item.id]) {
                    seen[item.id] = true
                    comics.push(item)
                }
            }
            return comics
        }
        for (let i = 0; i < els.length; i++) {
            let item = this.parseListItem(els[i])
            if (item && item.id && !seen[item.id]) {
                seen[item.id] = true
                comics.push(item)
            }
        }
        return comics
    }

    hasNextPage(doc, page) {
        let next =
            doc.querySelector("a.nextpostslink") ||
            doc.querySelector(".next.page-numbers") ||
            doc.querySelector("a[rel='next']")
        if (next) return true
        let pages = doc.querySelectorAll(".pages, .wp-pagenavi a, .nav-links a")
        if (pages && pages.length) {
            for (let i = 0; i < pages.length; i++) {
                let t = String(pages[i].text || "").trim()
                if (t === "»" || t === "下一页" || t.toLowerCase() === "next") return true
            }
        }
        // Madara 有时用 load more，按当前数量粗略判断
        return false
    }

    // ---------- 探索 ----------
    explore = [
        {
            title: "巴卡漫画",
            type: "multiPartPage",
            load: async () => {
                let parts = []
                // 热门
                let res1 = await Network.get(
                    this.buildUrl("/manga/?m_orderby=trending"),
                    this.headers
                )
                if (res1.status === 200) {
                    let doc = new HtmlDocument(res1.body)
                    let comics = this.parseComicsFromDoc(doc)
                    if (comics.length) parts.push({ title: "热门趋势", comics: comics })
                }
                // 最新
                let res2 = await Network.get(
                    this.buildUrl("/manga/?m_orderby=latest"),
                    this.headers
                )
                if (res2.status === 200) {
                    let doc = new HtmlDocument(res2.body)
                    let comics = this.parseComicsFromDoc(doc)
                    if (comics.length) parts.push({ title: "最近更新", comics: comics })
                }
                // 新作
                let res3 = await Network.get(
                    this.buildUrl("/manga/?m_orderby=new_manga"),
                    this.headers
                )
                if (res3.status === 200) {
                    let doc = new HtmlDocument(res3.body)
                    let comics = this.parseComicsFromDoc(doc)
                    if (comics.length) parts.push({ title: "新作", comics: comics })
                }
                if (parts.length === 0) {
                    throw "推荐页无数据（若遇 Cloudflare 验证，请换网络后重试）"
                }
                return parts
            }
        }
    ]

    // ---------- 分类 ----------
    category = {
        title: "巴卡漫画",
        parts: [
            {
                name: "排序",
                type: "fixed",
                categories: ["最新更新", "热门趋势", "评分", "新作", "字母"],
                categoryParams: ["latest", "trending", "rating", "new_manga", "alphabet"],
                itemType: "category"
            },
            {
                name: "状态",
                type: "fixed",
                categories: ["全部", "连载中", "已完结"],
                categoryParams: ["", "on-going", "end"],
                itemType: "category"
            }
        ],
        enableRankingPage: true,
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let orderby = "latest"
            let status = ""

            if (options && options[0]) orderby = String(options[0])
            if (options && options[1]) status = String(options[1])

            if (param !== undefined && param !== null && param !== "") {
                let p = String(param)
                if (category === "排序") orderby = p
                else if (category === "状态") status = p
            }

            let q = "m_orderby=" + encodeURIComponent(orderby)
            if (page > 1) q += "&page=" + page
            // Madara 状态筛选有时用路径
            let path = "/manga/?" + q
            if (status === "on-going") {
                path = "/manga-status/on-going/?m_orderby=" + encodeURIComponent(orderby) + (page > 1 ? "&page=" + page : "")
            } else if (status === "end" || status === "completed") {
                path = "/manga-status/end/?m_orderby=" + encodeURIComponent(orderby) + (page > 1 ? "&page=" + page : "")
            }

            let res = await Network.get(this.buildUrl(path), this.headers)
            if (res.status !== 200) throw "分类失败: HTTP " + res.status
            let doc = new HtmlDocument(res.body)
            let comics = this.parseComicsFromDoc(doc)
            let next = this.hasNextPage(doc, page) || comics.length >= 12

            return {
                comics: comics,
                maxPage: next ? page + 1 : page
            }
        },

        optionList: [
            {
                label: "排序",
                options: [
                    "latest-最新更新",
                    "trending-热门趋势",
                    "rating-评分",
                    "new_manga-新作",
                    "alphabet-字母"
                ]
            },
            {
                label: "状态",
                options: [
                    "-全部",
                    "on-going-连载中",
                    "end-已完结"
                ]
            }
        ],

        ranking: {
            options: ["trending-热门", "rating-评分", "latest-更新"],
            load: async (option, page) => {
                let order = option || "trending"
                let res = await Network.get(
                    this.buildUrl("/manga/?m_orderby=" + order + (page > 1 ? "&page=" + page : "")),
                    this.headers
                )
                if (res.status !== 200) throw "排行失败: HTTP " + res.status
                let doc = new HtmlDocument(res.body)
                let comics = this.parseComicsFromDoc(doc)
                return {
                    comics: comics,
                    maxPage: comics.length >= 12 ? page + 1 : page
                }
            }
        }
    }

    // ---------- 搜索 ----------
    search = {
        load: async (keyword, options, page) => {
            let url =
                this.buildUrl("/?s=" + encodeURIComponent(keyword) + "&post_type=wp-manga") +
                (page > 1 ? "&page=" + page : "")
            // 部分 Madara 用 /page/n/?s=
            if (page > 1) {
                url = this.buildUrl("/page/" + page + "/?s=" + encodeURIComponent(keyword) + "&post_type=wp-manga")
            }
            let res = await Network.get(url, this.headers)
            if (res.status !== 200) throw "搜索失败: HTTP " + res.status
            let doc = new HtmlDocument(res.body)
            let comics = this.parseComicsFromDoc(doc)
            // 搜索页另一种结构
            if (comics.length === 0) {
                let items = doc.querySelectorAll(".c-tabs-item__content, .tab-thumb, .row .c-tabs-item") || []
                let seen = {}
                for (let i = 0; i < items.length; i++) {
                    let item = this.parseListItem(items[i])
                    if (item && item.id && !seen[item.id]) {
                        seen[item.id] = true
                        comics.push(item)
                    }
                }
            }
            let next = this.hasNextPage(doc, page) || comics.length >= 12
            return {
                comics: comics,
                maxPage: next ? page + 1 : page
            }
        },
        optionList: []
    }

    // ---------- 详情 / 章节 / 图片 ----------
    comic = {
        loadInfo: async (id) => {
            let res = await Network.get(this.buildUrl("/manga/" + encodeURIComponent(id) + "/"), this.headers)
            if (res.status !== 200) throw "详情失败: HTTP " + res.status
            let doc = new HtmlDocument(res.body)
            let html = String(res.body || "")

            let titleEl =
                doc.querySelector(".post-title h1") ||
                doc.querySelector("h1") ||
                doc.querySelector(".manga-title")
            let title = titleEl ? String(titleEl.text || "").trim() : id

            let coverEl =
                doc.querySelector(".summary_image img") ||
                doc.querySelector(".manga-thumb img") ||
                doc.querySelector(".thumb img")
            let cover =
                this.attr(coverEl, "data-src") ||
                this.attr(coverEl, "data-lazy-src") ||
                this.attr(coverEl, "src") ||
                ""
            cover = this.absUrl(cover.replace(/-\d+x\d+(\.\w+)$/, "$1"))

            let descEl =
                doc.querySelector(".description-summary .summary__content") ||
                doc.querySelector(".summary__content") ||
                doc.querySelector(".manga-excerpt") ||
                doc.querySelector(".description-summary")
            let description = descEl ? String(descEl.text || "").trim() : ""

            let authors = []
            let authorEls = doc.querySelectorAll(".author-content a, .artist-content a") || []
            for (let i = 0; i < authorEls.length; i++) {
                let t = String(authorEls[i].text || "").trim()
                if (t) authors.push(t)
            }

            let tags = []
            let tagEls = doc.querySelectorAll(".genres-content a, .tags-content a") || []
            for (let i = 0; i < tagEls.length; i++) {
                let t = String(tagEls[i].text || "").trim()
                if (t) tags.push(t)
            }

            let statusText = ""
            let statusEl =
                doc.querySelector(".post-status .summary-content") ||
                doc.querySelector(".manga-status")
            if (statusEl) statusText = String(statusEl.text || "").trim()

            // 章节列表
            let chapters = new Map()
            let pushChapter = (href, name) => {
                if (!href) return
                let cid = ""
                // /manga/{slug}/c-xxx/  →  id/c-xxx
                let m = href.match(/\/manga\/([^\/]+)\/([^\/\#\?]+)\/?/)
                if (m) {
                    cid = decodeURIComponent(m[1]) + "/" + decodeURIComponent(m[2])
                } else {
                    cid = href.split("/").filter(Boolean).pop() || name
                }
                if (!name) name = cid
                if (!chapters.has(cid)) chapters.set(cid, name)
            }

            let chapterLinks = doc.querySelectorAll("li.wp-manga-chapter a, .listing-chapters_wrap a, .main.version-chap a") || []
            for (let i = 0; i < chapterLinks.length; i++) {
                let a = chapterLinks[i]
                let href = this.attr(a, "href") || ""
                let name = String(a.text || "").trim()
                pushChapter(href, name)
            }

            // AJAX 补全章节（Madara 常用）
            if (chapters.size < 3) {
                let mangaId = ""
                let idMatch = html.match(/mangaid\s*[:=]\s*["']?(\d+)/i) ||
                    html.match(/data-id=["'](\d+)["']/) ||
                    html.match(/wp-manga-manga["']?\s*[:=]\s*["']?(\d+)/)
                if (idMatch) mangaId = idMatch[1]
                if (mangaId) {
                    try {
                        let ajaxRes = await Network.post(
                            this.buildUrl("/wp-admin/admin-ajax.php"),
                            {
                                ...this.headers,
                                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                                "X-Requested-With": "XMLHttpRequest",
                            },
                            "action=manga_get_chapters&manga=" + mangaId
                        )
                        if (ajaxRes.status === 200 && ajaxRes.body) {
                            let adoc = new HtmlDocument(ajaxRes.body)
                            let als = adoc.querySelectorAll("li.wp-manga-chapter a, a") || []
                            for (let i = 0; i < als.length; i++) {
                                let href = this.attr(als[i], "href") || ""
                                if (href.indexOf("/manga/") < 0) continue
                                pushChapter(href, String(als[i].text || "").trim())
                            }
                        }
                    } catch (e) {}
                }
            }

            // 正则兜底
            if (chapters.size === 0) {
                let re = /href="(https?:\/\/[^"]*\/manga\/[^"]+\/c-[^"]+\/?)"[^>]*>([^<]*)</g
                let mm
                while ((mm = re.exec(html)) !== null) {
                    pushChapter(mm[1], mm[2].trim())
                }
            }

            return {
                title: title || ("漫画 " + id),
                cover: cover,
                description: description,
                tags: {
                    "作者": authors,
                    "状态": statusText ? [statusText] : [],
                    "标签": tags,
                },
                chapters: chapters,
                isFavorite: false,
                subId: id
            }
        },

        loadEp: async (comicId, epId) => {
            // epId 形如 slug/c-1 或完整路径
            let path = epId
            if (epId.indexOf("http") === 0) {
                path = epId
            } else if (epId.indexOf("/") >= 0) {
                path = "/manga/" + epId + "/"
            } else {
                path = "/manga/" + comicId + "/" + epId + "/"
            }
            let url = path.indexOf("http") === 0 ? path : this.buildUrl(path)
            let res = await Network.get(url, this.headers)
            if (res.status !== 200) throw "章节失败: HTTP " + res.status + " | " + url

            let doc = new HtmlDocument(res.body)
            let html = String(res.body || "")
            let images = []

            let imgs =
                doc.querySelectorAll(".reading-content img") ||
                doc.querySelectorAll(".page-break img") ||
                doc.querySelectorAll("#chapter-images img") ||
                doc.querySelectorAll(".wp-manga-chapter-img") ||
                []

            for (let i = 0; i < imgs.length; i++) {
                let u =
                    this.attr(imgs[i], "data-src") ||
                    this.attr(imgs[i], "data-lazy-src") ||
                    this.attr(imgs[i], "data-original") ||
                    this.attr(imgs[i], "src") ||
                    ""
                if (!u || u.indexOf("data:") === 0) continue
                if (u.indexOf("loading") >= 0 || u.indexOf("placeholder") >= 0) continue
                images.push(this.absUrl(u))
            }

            if (images.length === 0) {
                // 正则提取
                let chunks = html.split(/data-src=["']/)
                for (let i = 1; i < chunks.length; i++) {
                    let u = chunks[i].split(/["']/)[0].trim()
                    if (!u || u.indexOf("http") < 0) continue
                    if (u.indexOf("avatar") >= 0 || u.indexOf("logo") >= 0) continue
                    images.push(this.absUrl(u))
                }
            }

            if (images.length === 0) {
                throw "未解析到图片 | ep=" + epId
            }

            // 去重保序
            let seen = {}
            let uniq = []
            for (let i = 0; i < images.length; i++) {
                if (!seen[images[i]]) {
                    seen[images[i]] = true
                    uniq.push(images[i])
                }
            }
            return { images: uniq }
        },

        onImageLoad: (url, comicId, epId) => {
            return {
                url: url,
                headers: this.imgHeaders,
            }
        },

        onThumbnailLoad: (url) => {
            return { headers: this.imgHeaders }
        },

        onClickTag: (namespace, tag) => {
            return { action: "search", keyword: tag }
        }
    }

    // ---------- 设置 ----------
    settings = {
        domain: {
            title: "线路域名",
            type: "select",
            options: [
                { value: "https://bakamh.com", text: "bakamh.com" },
            ],
            default: "https://bakamh.com",
        },
        ua: {
            title: "User-Agent",
            type: "input",
            default: Bakamh.defaultUa,
        },
    }
}

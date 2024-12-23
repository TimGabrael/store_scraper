import { TimeoutError } from "puppeteer";

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const jsdom = require("jsdom")
const { JSDOM } = jsdom;
const fs = require('fs');
import { Database } from "sqlite3";
var getDirName = require('path').dirname;
puppeteer.use(StealthPlugin());

const rewe_cookies = [
    {
        name: '_rdfa',
        // add cookie in here from browser, this stores the location info for rewe to use and is required for accurate readings of the 'const last_page_idx = GetLastPageIndex(dom);'
        value: '...',
        path: '/',
        domain: 'shop.rewe.de',
        sameSite: 'Lax',
    },
    {
        name: 'websitebot-launch',
        value: 'human-mousemove',
        path: '/',
        domain: 'shop.rewe.de',
    },
];

function TransformToNumber(input: string): number {
    const standardizedInput = input.replace(',', '.');
    const result = parseFloat(standardizedInput);
    return result;
}
function WriteFile(path: string, contents: string, cb: any) {
    fs.mkdir(getDirName(path), {recursive: true}, function (err) {
        if(err) return cb(err);
        fs.writeFileSync(path, contents, cb);
    });
}
let browser: any;
async function LoadPage(url: string, cookies: object[]) : Promise<string> {
    console.log(url);
    let html_content = "";
    try {
        if(!browser) {
            browser = await puppeteer.launch({
                headless: false,
                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox"
                ]
            });
        }
        const [page] = await browser.pages();
        await page.setCookie(...cookies);
        await page.goto(url, { waitUntil: ['domcontentloaded', 'networkidle2'], timeout: 5000, });

        html_content = await page.content();
    } catch (err) {
        //console.error('Error downloading the webpage:', err);
        //usually just a timeout error
        //happens quite often so just ignore the error entierly
        //but if something seems off just add the error logging back in
    }
    return html_content;
};
async function LoadPageDefinitive(url: string, cookies: object[]) : Promise<string> {
    var page: string = await LoadPage(url, cookies);
    while(page.length < 2) {
        try {
            page = await LoadPage(url, cookies);
        }
        catch(err) {
            continue;
        }
    }
    return page;
}

function GetLastPageIndex(dom: jsdom.JSDOM) : number {
    try {
        var elements = dom.window.document.getElementsByClassName("PostRequestGetFormButton paginationPage paginationPageLink");
        if(elements.length <= 0) {
            return NaN;
        }
        return parseInt(elements[elements.length - 1].innerHTML);
    }
    catch(error) {
        console.error("Failed to get the last page index: " + error);
        return NaN;
    }
}
function ParseContent(dom: typeof JSDOM, category: string) : object {
    const PRICE_REGEX_EOS = new RegExp(/(.*) ([0-9]*[,.]?[0-9]*) .$/);  // PRICE REGEX END OF STRING
    const URL_REGEX_COMMA = new RegExp(/(https:[#-z]*),/g);         // URL WITH A COMMA AT THE END
    var output = {
        "category": category,
        "elements": [],
    };
    const product_list = dom.window.document.getElementsByClassName("search-service-rsTiles search-service-rsQaTiles search-service-rsTilesDefault plrProductGrid");
    if(product_list.length == 0) {
        return output;
    }
    const products = product_list[0];
    for(const product of products.children) {
        try {
            const product_info = product.getElementsByClassName("search-service-productDetailsLink productDetailsLink")[0];
            const product_label = product_info.getAttribute("aria-label");
            const product_url: string = product_info.href;
            const product_id: string = product_url.substring(product_url.lastIndexOf("/") + 1, product_url.length);
            
            const product_match = product_label.match(PRICE_REGEX_EOS);
            const product_name: string = product_match[1];
            const product_price: string = product_match[2];

            const img_data = product.getElementsByClassName("search-service-rsProductsMedia rsProductsMedia")[0].children[0].children[0].srcset;
            const img_urls = [...img_data.matchAll(URL_REGEX_COMMA)];
            const last_img_url: string = img_urls.pop()[1];

            output.elements.push({
                "name": product_name,
                "price": product_price,
                "url": product_url,
                "id": product_id,
                "img_url": last_img_url,
            });
        }
        catch(error) {
            continue;
        }
    }
    return output;
}
async function LoadReweData() {
    let full_data = [];
    const rewe_shop_url = "https://shop.rewe.de";
    const dom = new JSDOM(await LoadPageDefinitive(rewe_shop_url, rewe_cookies));
    const categories_list = dom.window.document.getElementsByClassName("home-page-category-tiles");
    if(categories_list.length == 0) {
        console.error('No home-page-category-tiles in Main homepage');
        return;
    }
    const categories = categories_list[0];
    for(let child of categories.children) {
        if(child.getAttribute('href')) {
            const href = child.href.toString();
            const category_url = rewe_shop_url + href;
            let category_name_start = href.search("/c/");
            if(category_name_start < 0) {
                category_name_start = 1;
            }
            else {
                category_name_start = 3;
            }
            const category_name_end_s = href.indexOf("/", category_name_start + 1);
            const category_name_end_q = href.indexOf("?", category_name_start + 1);
            const category_name_end = (category_name_end_q > category_name_end_s && category_name_end_s > 0) ? category_name_end_s : category_name_end_q;
            const category_name = href.substring(category_name_start, category_name_end);
            console.log(category_name)
            const dom = new JSDOM(await LoadPageDefinitive(category_url, rewe_cookies))
            ParseContent(dom, category_name);
            const last_page_idx = GetLastPageIndex(dom);
            if(isNaN(last_page_idx)) {
                continue;
            }

            for(let i = 2; i < last_page_idx; i++) {
                const page_url = href.substring(0, category_name_start) + category_name + "/?page=" + i;
                const dom = new JSDOM(await LoadPageDefinitive(rewe_shop_url + page_url, rewe_cookies))
                full_data.push(ParseContent(dom, category_name));
            }
        }
    }
    let today = new Date();
    let dd = String(today.getDate()).padStart(2, '0');
    let mm = String(today.getMonth() + 1).padStart(2, '0');
    let yyyy = today.getFullYear();
    let filename = yyyy + "." + mm + "." + dd+ ".json";
    WriteFile("rewe/json/" + filename, JSON.stringify(full_data), (err) => {
        if(err) {
            console.log("Failed to Write Rewe json file: " + err);
        }
    });
}

function NormalizeReweData(data: object, date: string) {
    let new_data = [];
    for(let category_idx in data) {
        let category_name = data[category_idx].category;
        for(let product_idx in data[category_idx].elements) {
            let product = data[category_idx].elements[product_idx];
            let name = product.name;
            let price = product.price;
            let url = product.url;
            let id = product.id;
            let img_url = product.img_url;
            let normalized_id = "rewe" + id;
            let found_product = new_data.find((prod) => {
                return prod.id === normalized_id;
            });
            if(found_product) {
                found_product.categories.push(category_name);
            }
            else {
                new_data.push({
                    "id": normalized_id,
                    "date": date,
                    "name": name,
                    "image": img_url[1], // only once
                    "price": TransformToNumber(price),
                    "categories": [category_name],
                    "company": "rewe",
                });
            }
        }
    }
    return new_data;
}
function WriteToDatabase(data: any) {
    const db = new Database("database/products.db");
    db.run("BEGIN TRANSACTION");
    for(let product_idx in data) {
        let product = data[product_idx];
        db.run("INSERT INTO products (id, date, name, image, price, categories, company) VALUES (?, ?, ?, ?, ?, ?, ?)", [product.id, product.date, product.name, product.image, product.price, JSON.stringify(product.categories), product.company]);
    }
    db.run("COMMIT");
}


async function ExtractAndStore() {
    let today = new Date();
    let dd = String(today.getDate()).padStart(2, '0');
    let mm = String(today.getMonth() + 1).padStart(2, '0');
    let yyyy = today.getFullYear();
    let date = yyyy + "." + mm + "." + dd;
    let current_date_filename = date + ".json";
    await fs.exists("rewe/json/" + current_date_filename, (exist) => {
        if(!exist) {
            LoadReweData();
        }
    });

    let data = JSON.parse(fs.readFileSync("rewe/json/" + current_date_filename));
    let new_data = NormalizeReweData(data, date);
    WriteToDatabase(new_data);
}

ExtractAndStore();



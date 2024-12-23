const jsdom = require("jsdom")
const { JSDOM } = jsdom;
const fs = require('fs');
import fetch from 'node-fetch';

async function GetWebpage(url: string) {
    const response = await fetch(url, {method: 'GET'});
    return await response.json();
}


async function LoadAldiData() {

}

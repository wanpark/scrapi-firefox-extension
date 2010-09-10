// require core.js

Scrapi.Extract = {

    onLoad: function() {
        let browser = Scrapi.getBrowser();
        if (browser) {
            this.onPageLoad = Scrapi.bind(this.onPageLoad, this);
            this.onLocationChange = Scrapi.bind(this.onLocationChange, this);
            browser.addEventListener("DOMContentLoaded", this.onPageLoad, true);
            browser.addProgressListener(this);
            this.setupPage(browser.contentDocument, true);
        }
    },
    onUnload: function() {
        let browser = Scrapi.getBrowser();
        if (browser) {
            browser.removeEventListener("DOMContentLoaded", this.onPageLoad, true);
            browser.removeProgressListener(this);
        }
    },

    parseURL: function(url) {
        if (!url) return null;
        let match = url.match(/^https?:\/\/twitter.com\/([^\/]+)\/status\/(\d+)/);
        if (match) {
            return {
                type: 'twitter',
                url: url,
                user_name: match[1],
                status_id: match[2],
                label: 'twitter:' + match[2],
                status: 'loading'
            };
        } else if ((match = url.match(/^(https?:\/\/[^\/]*?\/test\/read\.cgi\/[^\/]+\/\d+\/)(\d+)/))) {
            return {
                type: 'nich',
                url: url,
                thread_url: match[1],
                res_number: match[2],
                label: url,
                status: 'error'
            };
        }
        return null;
    },

    getCurrentPageType: function(doc) {
        doc = doc || Scrapi.getActiveDocument();
        if (!doc) return '';
        let url = doc.documentURI;
        if (!url) return '';
        if (url.match(/^https?:\/\/twitter.com\//)) {
            return 'twitter';
        } else if (url.match(/\/test\/read\.cgi\/[^\/]+\/\d+\//)) {
            return 'nich';
        } else {
            return '';
        }
    },

    getCurrentNichPageClient: function(doc) {
        doc = doc || Scrapi.getActiveDocument();
        if (!doc) return '';
        let url = doc.documentURI;
        if (!url) return '';
        if (url.match(/^https?:\/\/[^\/]+\/thread\/http/)) {
            return 'chaika';
        } else {
            return 'web';
        }
    },
    
    getContent: function(url) {
        let info = this.parseURL(url);
        if (!info) return null;
        if (info.type == 'twitter') {
            return this.getTwitterContent(url);
        } else if (info.type == 'nich') {
            return this.getNichContent(url);
        }
        return null;
    },
    getAllContents: function() {
        let type = this.getCurrentPageType();
        if (type == 'twitter') {
            return this.getAllTwitterContents();
        } else if (type == 'nich') {
            return this.getAllNichContens();
        } else {
            return [];
        }
    },
    
    getTwitterContent: function(url) {
        let doc = Scrapi.getActiveDocument();
        if (!doc) return null;
        
        let urlInfo = this.parseURL(url);
        if (!urlInfo || urlInfo.type != 'twitter') return null;
        let container = doc.getElementById('status_' + urlInfo.status_id);
        if (!container) {
            // retweet
            container = this.xpath(
                '//a[@href="' + url + '"][@rel="bookmark"]/ancestor::*[contains(@class, "hentry")]',
                null, doc
            );
            if (!container) return null;
        }

        return this.getTwitterContentFromElement(container);
    },
    
    getAllTwitterContents: function() {
        let doc = Scrapi.getActiveDocument();
        if (!doc) return [];
        let results = [];
        let iter = this.getXPathResult('//*[contains(@class,"hentry")]', null, doc);
        let container;
        while ((container = iter.iterateNext())) {
            let attrs = this.getTwitterContentFromElement(container);
            if (attrs) results.push(attrs);
        }
        return results;
    },

    getTwitterContentFromElement: function(element) {
        let doc = Scrapi.getActiveDocument();
        if (!doc) return null;

        let attrs = {};
        try {
            attrs.url = this.xpath('descendant::a[@rel="bookmark"]/@href', element).nodeValue;
            attrs.status_id = attrs.url.split('/').pop();
            attrs.user_name = element.getAttribute('class').split(/\s+/)[1].replace(/^u-/, '');
            attrs.content = this.xpath('descendant::span[@class="entry-content"]', element).textContent;
            attrs.posted_at = Scrapi.parseDate(Scrapi.parseInvalidJSON(
                this.xpath('descendant::span[@class="published timestamp"]/@data', element).nodeValue
            ).time).toUTCString();
            let reply = this.xpath('descendant::span[contains(@class,"entry-meta")]/span/following-sibling::a[starts-with(@href, "http://twitter.com/")]/@href', element);
            if (reply) attrs.reply_to = reply.nodeValue;
            for each (let value in attrs)
                if (!value) return null;
            if (!attrs.status_id.match(/^\d+$/)) return null;
        } catch (error) {
            return null;
        }
        attrs.type = 'twitter';
        attrs.label = attrs.user_name + ': ' + attrs.content;
        return attrs;
    },


    getAllNichContens: function() {
        let doc = Scrapi.getActiveDocument();
        if (!doc) return [];
        let client = this.getCurrentNichPageClient(doc);
        if (client == 'web') {
            let results = [];
            let iter = this.getXPathResult('//dl[@class="thread"]/dt', null, doc);
            let container;
            while ((container = iter.iterateNext())) {
                let attrs = this.getNichWebContentFromStatusElement(doc.documentURI, container);
                if (attrs) results.push(attrs);
            }
            return results;
        } else if (client == 'chaika') {
            let results = [];
            let iter = this.getXPathResult('//dl[contains(@class,"resContainer")]', null, doc);
            let container;
            while ((container = iter.iterateNext())) {
                let attrs = this.getNichChaikaContentFromElement(doc.documentURI, container);
                if (attrs) results.push(attrs);
            }
            return results;
        }
        return [];
    },
    getNichContent: function(url) {
        let doc = Scrapi.getActiveDocument();
        if (!doc) return null;
        let urlInfo = this.parseURL(url);
        if (!urlInfo || urlInfo.type != 'nich' || !urlInfo.res_number) return null;
        let client = this.getCurrentNichPageClient(doc);
        if (client == 'web') {
            return this.getNichWebContentFromStatusElement(
                url, this.xpath('//dt[starts-with(string(), "' + urlInfo.res_number + ' ")]', null, doc)
            );
        } else if (client == 'chaika') {
            return this.getNichChaikaContentFromElement(
                url, this.xpath('//dl[@id="res' + urlInfo.res_number + '"]', null, doc)
            );
        }
        return null;
    },
    getNichWebContentFromStatusElement: function(url, element) {
        if (!element) return null;
        let doc = Scrapi.getActiveDocument();
        if (!doc) return null;
        let attrs = {
            type: 'nich'
        };
        try {
            let contentElement = element.nextSibling;
            if (contentElement.tagName.toLowerCase() != 'dd') throw null;
            attrs.content = this.unescapeNichContent(contentElement.innerHTML);
            let mail = this.xpath('descendant::a[starts-with(@href, "mailto:")]/@href', element);
            if (mail) attrs.user_mail = mail.nodeValue.replace(/^mailto:/, '');
            let status = element.textContent.split('¡§');
            if (status.length < 3) throw null;
            let numberMatch = status[0].match(/\d+/);
            if (!numberMatch) throw null;
            attrs.res_number = numberMatch[0];
            attrs.user_name = status[1];
            let idMatch = status[2].match(/ID:([^\s]+)/);
            if (idMatch) attrs.user_id = idMatch[1];
            let time = this.parseNichTimestamp(status[2]);
            if (time) attrs.posted_at = time.toUTCString();
            attrs.label = attrs.res_number + ': ' + attrs.content.slice(0, 30);
            let urlMatch = url.match(/^https?:\/\/[^\/]*?\/test\/read\.cgi\/[^\/]+\/\d+\//);
            if (!urlMatch) throw null;
            attrs.thread_url = urlMatch[0];
            attrs.url = attrs.thread_url + attrs.res_number;
        } catch (error) {
            return null;
        }
        return attrs;
    },
    getNichChaikaContentFromElement: function(url, element) {
        if (!element) return null;
        let doc = Scrapi.getActiveDocument();
        if (!doc) return null;
        try {
            let attrs = {
                type: 'nich',
                res_number: parseInt(this.css(element, 'span.resNumber').textContent),
                user_name: this.css(element, 'span.resName').textContent,
                user_id:   this.css(element, 'span.resID').textContent,
                user_mail: this.css(element, 'span.resMail').textContent,
                posted_at: this.parseNichTimestamp(this.css(element, 'span.resDate').textContent).toUTCString(),
                content: this.unescapeChaikaContent((this.css(element, 'span.aaRes') || this.css(element, 'dd.resBody')).innerHTML)
            };
            attrs.label = attrs.res_number + ': ' + attrs.content.slice(0, 30);
            
            let urlMatch = url.match(/https?:\/\/[^\/]*?\/test\/read\.cgi\/[^\/]+\/\d+\//);
            if (!urlMatch) throw null;
            attrs.thread_url = urlMatch[0];
            attrs.url = attrs.thread_url + attrs.res_number;
            return attrs;
        } catch (error) {
            return null;
        }
    },

    css: function(node, selector) {
        let [tagName, className] = selector.split('.');
        return this.xpath('descendant::' + tagName + '[@class="' + className + '"]', node);
    },

    parseNichTimestamp: function(str) {
        let [day, time] = str.split(/\s+/);
        if (!time) return null;
        let dm = day.match(/(\d{4})\/(\d{2})\/(\d{2})/);
        let tm = time.match(/(\d{2}):(\d{2}):(\d{2})/);
        if (!dm || !tm) return null;
        let date = new Date(
            parseInt(dm[1], 10), parseInt(dm[2], 10) - 1, parseInt(dm[3], 10),
            parseInt(tm[1], 10), parseInt(tm[2], 10), parseInt(tm[3], 10)
        );
        if (isNaN(date.getTime())) return null;
        return date;
    },

    unescapeNichContent: function(content) {
        content = content.replace(/\s?<br>\s?/g, "\n");
        content = content.replace(/^\s/, '').replace(/\s+$/, '');
        content = content.replace(/<a[^>]*>([^<]*)<\/a>/g, '$1');
        content = content.replace(/\s?<img[^>]*>\s?\n?/g, '');
        content = content.replace(/\s?<[^>]*>\s?/g, '');
        content = content.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
        return content;
    },

    unescapeChaikaContent: function(content) {
        content = content.replace(/<a[^>]*>([^<]+)<\/a>/g, '$1');
        content = content.replace(/\s*<br>\s?/g, "\n").replace(/\s+$/, '').replace(/^\s/, '');
        content = content.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
        return content;
    },

    getNichResNumbersFromContent: function(content) {
        let numbers = [];
        let appeared = {};
        let push = function(i) {
            if (!(i in appeared)) {
                numbers.push(i);
                appeared[i] = true;
            }
        };
        let regexp = /[>¡ä](\d+(\-\d+)?(,\d+(\-\d+)?)*)/g;
        let match;
        while ((match = regexp.exec(content))) {
            match[1].split(',').forEach(function(seq) {
                let nums = seq.match(/(\d+)\-(\d+)/);
                if (nums) {
                    let start = parseInt(nums[1], 10);
                    let end = parseInt(nums[2], 10);
                    if (!isNaN(start) && !isNaN(end) && end - start < 100) {  // skip if over 100 res range
                        for (let i = start; i <= end; i++)
                            push(i);
                    }
                }  else {
                    let num = parseInt(seq, 10);
                    if (!isNaN(num)) push(num);
                }
            });
        }
        return numbers;
    },

    xpath: function(xpath, node, doc) {
        return this.getXPathResult(xpath, node, doc).iterateNext();
    },
    getXPathResult: function(xpath, node, doc) {
        doc = doc || node.ownerDocument;
        const context = node || doc.documentElement;
        const type = XPathResult.ORDERED_NODE_ITERATOR_TYPE;
        const resolver = { lookupNamespaceURI: function(prefix) 'http://www.w3.org/1999/xhtml' };
        try {
            var expression = doc.createExpression(xpath, resolver);
            return expression.evaluate(context, type, null);
        } catch(e) {
            return { iterateNext: function() null };
        }
    },
    

    // add entry link to browser page
    
    onPageLoad: function(event) {
        this.setupPage(event.originalTarget);
    },
    onLocationChange: function(progress, request, location){
        if (location && !progress.isLoadingDocument)
            this.setupPage(progress.DOMWindow.document);
    },
    onStatusChange: function(){},
    onProgressChange: function(){},
    onStateChange: function(){},
    onSecurityChange: function(){},

    setupPage: function(doc) {
        if (!doc) return;
        if (doc._scrapiInitialized) return;
        doc._scrapiInitialized = true;

        let type = this.getCurrentPageType(doc);
        if (type != 'nich') return;
        let client = this.getCurrentNichPageClient(doc);
        if (client == 'web') {
            this.setupNichWebPage(doc);
        } else if (client == 'chaika') {
            this.setupNichChaikaPage(doc);
        }
    },

    setupNichWebPage: function(doc) {
        doc.addEventListener('mouseover', function(event) {
            let element = event.target;
            if (element.tagName != 'DT' || element.parentNode.className != 'thread')
                return;
            let threadURL = doc.documentURI.replace(/\/[^/]*$/, '/');
            element.innerHTML = element.innerHTML.replace(/^(\d+)/, function(match) {
                return '<a href="' + threadURL + match + '">' + match + '</a>';
            });
        }, false);
    },

    setupNichChaikaPage: function(doc) {
        doc.addEventListener('mouseover', function(event) {
            let element = event.target;
            if (element.tagName != 'SPAN' || element.className != 'resNumber')
                return;
            let threadURL = doc.documentURI.replace(/^.+\/http:\/\//, 'http://').replace(/\/[^/]*$/, '/');
            element.innerHTML = element.innerHTML.replace(/^(\d+)/, function(match) {
                return '<a href="' + threadURL + match + '">' + match + '</a>';
            });
        }, false);
    }
    
};
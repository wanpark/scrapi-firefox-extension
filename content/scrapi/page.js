// require core.js, extract.js, scrap.js

Scrapi.Page = {

    // ==========
    // properties
    // ==========

    // scrap list rdf object
    scraps: null,
    
    // selected tab's scrap object
    get scrap() {
        return this.scraps.currentScrap;
    },

    
    // ==========
    // setup
    // ==========
    
    onLoad: function() {
        this.treeListener.listen();
        this.scraps = (new Scrapi.Scraps()).flush();
        this.setupTabsDataSource();
        this.scraps.select(this.tabs.selectedIndex - 1);
        Scrapi.Events.addListener(SELECTED_ENTRY_CHANGE_KEY, Scrapi.bind(this.changeProperties, this));
        Scrapi.Events.addListener(ENTRY_MODIFY_KEY, Scrapi.bind(this.changeProperties, this));
        Scrapi.Extract.onLoad();
    },
    
    setupTabsDataSource: function() {
        Scrapi.Extract.onUnload();
        Scrapi.Events.addListener(SELECTED_SCRAP_CHANGE_KEY, this.onSelectedScrapChange);
        this.tabs.database.AddDataSource(this.scraps.dataSource);
        this.tabs.builder.rebuild();
    },
    
    onUnload: function() {
        Scrapi.Events.clear();
        this.treeListener.unlisten();
        this.scraps.select(this.tabs.selectedIndex - 1, true); // save selected tab
    },

    
    // ==========
    // popup handler
    // ==========

    onPopupShowing: function(event) {
        if (!this.scrap || this.tree.view.selection.count == 0) {
            event.preventDefault();
            return;
        }
        let isBold = (this.scrap.getAttribute('decoration') == 'bold');
        this.menuBold.setAttribute('checked', isBold ? 'true' : 'false');

        let isRes = (this.scrap.getAttribute('mode') == 'response');
        this.menuResponse.setAttribute('checked', isRes ? 'true' : 'false');

        let pageType = Scrapi.Extract.getCurrentPageType();
        let entryType = this.scrap.getAttribute('type');

        this.menuSelectNichUser.setAttribute('hidden', entryType == 'nich' ? 'false' : 'true');
        this.menuSelectNichID.setAttribute('hidden', entryType == 'nich' ? 'false' : 'true');
        this.menuSelectTwitterUser.setAttribute('hidden', entryType == 'twitter' ? 'false' : 'true');

        this.menuExtractNichUser.setAttribute('hidden', entryType == 'nich' ? 'false' : 'true');
        this.menuExtractNichUser.setAttribute('disabled', pageType == 'nich' ? 'false' : 'true');
        this.menuExtractNichID.setAttribute('hidden', entryType == 'nich' ? 'false' : 'true');
        this.menuExtractNichID.setAttribute('disabled', pageType == 'nich' ? 'false' : 'true');
        this.menuExtractNichReply.setAttribute('hidden', entryType == 'nich' ? 'false' : 'true');
        this.menuExtractNichReply.setAttribute('disabled', pageType == 'nich' ? 'false' : 'true');
        this.menuExtractTwitterUser.setAttribute('hidden', entryType == 'twitter' ? 'false' : 'true');
        this.menuExtractTwitterUser.setAttribute('disabled', pageType == 'twitter' ? 'false' : 'true');
        this.menuExtractTwitterReply.setAttribute('hidden', entryType == 'twitter' ? 'false' : 'true');
        this.menuExtractSeparator.setAttribute('hidden', entryType == 'text' ? 'true' : 'false');

        this.menuReloadSeparator.setAttribute('hidden', entryType == 'twitter' ? 'false' : 'true');
        this.menuReload.setAttribute('hidden', entryType == 'twitter' ? 'false' : 'true');
    },


    // ==========
    // tab handlers
    // ==========

    onTabSelect: function(event) {
        if (this.scraps)
            this.scraps.select(this.tabs.selectedIndex - 1);
    },

    onTabsDoubleClick: function(event) {
        if (event.target.tagName != 'tabs') return;
        this.openNewTab();
    },

    onTabClick: function(event) {
        if (event.button == 1) {  // wheel click
            this.closeTabAt(this.tabs.getIndexOfItem(event.target) - 1);
        }
    },
    

    // ==========
    // tree handlers
    // ==========

    onSelectedScrapChange: function(index) {
        Scrapi.Page.setTreeDataSource();
    },

    setTreeDataSource: function() {
        if (!this.scrap) return;
        if (this.tree.view)
            this.tree.view.selection.clearSelection();

        let sources = this.tree.database.GetDataSources();
        while (sources.hasMoreElements()) {
            this.tree.database.RemoveDataSource(sources.getNext());
        }

        this.tree.setAttribute('ref', this.scrap.containerResourceName);
        this.tree.database.AddDataSource(this.scrap.dataSource);
        this.tree.builder.rebuild();
    },

    onTreeDoubleClick: function(event) {
        if (!this.scrap) return;
        this.scrap.openSelectedEntries();
    },

    onTreeDragStart: function(event) {
        if (event.target.localName != "treechildren")
            return;
         if (this.tree.view.selection.count != 1)
             return;
        event.dataTransfer.setData("text/x-moz-tree-index", this.tree.view.selection.currentIndex);
        event.dataTransfer.dropEffect = "move";
    },


    treeListener: {
        listen: function() {
            Scrapi.Page.tree.builder.QueryInterface(Ci.nsIXULTreeBuilder).addObserver(this);
            Scrapi.Page.tree.builder.addListener(this);
            Scrapi.Events.addListener(ENTRY_REMOVE_KEY, Scrapi.bind(this.onEntryModified, this));
            Scrapi.Events.addListener(ENTRY_ADD_KEY, Scrapi.bind(this.onEntryModified, this));
        },
        unlisten: function() {
            Scrapi.Page.tree.builder.QueryInterface(Ci.nsIXULTreeBuilder).removeObserver(this);
            Scrapi.Page.tree.builder.removeListener(this);
        },
        canDrop : function(index, orient, dt) {
            if (dt.types.contains("text/x-moz-tree-index")) {
                return true;
            } else if (dt.types.contains("text/x-moz-url-data")) {
                return true;
            } else if (dt.types.contains("text/plain")) {
                // selected text
                return true;
            }
            return false;
        },
        onDrop : function(to, orient, dt) {
            if (!Scrapi.Page.scrap) return;
            if (dt.types.contains('text/x-moz-tree-index')) {
                let from = Scrapi.Page.tree.view.selection.currentIndex;
                if (from < to && orient == Ci.nsITreeView.DROP_BEFORE)
                    to--;
                if (from > to && orient == Ci.nsITreeView.DROP_AFTER)
                    to++;
                if (from != to)
                    Scrapi.Page.scrap.moveEntry(from, to);
            } else {
                if (to != -1 && orient == Ci.nsITreeView.DROP_AFTER)
                    to++;
                if (dt.types.contains('text/x-moz-url-data')) {
                    let url = dt.getData('text/x-moz-url-data');
                    if (Scrapi.Page.scrap.canAcceptURL(url)) {
                        Scrapi.Page.scrap.insertLinkAt(url, to);
                    } else {
                        let title = dt.getData('text/x-moz-url-desc') || url;
                        Scrapi.Page.scrap.insertTextAt(title, url, title, to);
                    }
                } else if (dt.types.contains('text/plain')) {
                    let doc = Scrapi.getActiveDocument();
                    if (doc) {
                        Scrapi.Page.scrap.insertTextAt(dt.getData('text/plain'), doc.location.href, doc.title, to);
                    }
                }
            }
        },

        rebuilding: true,
        nextSelecteIndex: NaN,
        
        willRebuild: function(builder) {
            this.rebuilding = true;
        },
        didRebuild: function(builder) {
            this.rebuilding = false;
            if (this.nextSelecteIndex !== NaN) {
                if (!this.isTreeSelected())
                    Scrapi.Page.tree.view.selection.select(Math.max(Math.min(index, Scrapi.Page.tree.view.rowCount - 1), 0));
                this.nextSelecteIndex = NaN;
            }
        },

        onEntryModified: function(index) {
            if (this.rebuilding) {
                this.nextSelecteIndex = index;
            } else {
                this.nextSelecteIndex = NaN;
                if (!this.isTreeSelected()) {
                    Scrapi.Page.tree.view.selection.select(Math.max(Math.min(index, Scrapi.Page.tree.view.rowCount - 1), 0));
                }
            }
        },

        isTreeSelected: function() {
            let tree = Scrapi.Page.tree;
            let selection = tree.view.selection;
            if (selection.count == 0) return false;
            if (selection.currentIndex < 0 || selection.currentIndex >= tree.view.rowCount) return false;
            return true;
        }
    },

    onTreeSelect: function() {
        if (!this.scrap) return;
        this.scrap.select(this.tree.view.selection);
    },


    // ==========
    // properties view handling
    // ==========

    changeProperties: function() {
        let type;
        try {
            if (!this.scrap ||
                !this.scrap.selection ||
                this.scrap.selection.count != 1) {
                throw null;
            }
            type = this.scrap.getAttribute('type');
            if (!type) throw null;
        } catch (e) {
            this.showEmptyProperties();
            return;
        }
        this['show' + Scrapi.capitalize(type) + 'Properties'].call(this);
    },

    showEmptyProperties: function() {
        this.properties.selectedIndex = EMPTY_PROPERTY_INDEX;
    },

    showTwitterProperties: function() {
        this.properties.selectedIndex = TWITTER_PROPERTY_INDEX;
        this.twitterUserImage.setAttribute('src', 'http://img.tweetimag.es/i/' + this.scrap.getAttribute('user_name'));
        this.twitterUserName.setAttribute('value', '@' + this.scrap.getAttribute('user_name'));
        this.twitterUserName.setAttribute('href', 'http://twitter.com/' + this.scrap.getAttribute('user_name'));
        this.twitterTimestamp.setAttribute('value', this.formatTimestamp(this.scrap.getAttribute('posted_at')));
        this.twitterTimestamp.setAttribute('href', this.scrap.getAttribute('url'));
        let replyTo = Scrapi.Extract.parseURL(this.scrap.getAttribute('reply_to'));
        if (replyTo && replyTo.user_name) {
            this.twitterReplyTo.setAttribute('hidden', 'false');
            this.twitterReplyTo.setAttribute('value', 'in reply to @' + replyTo.user_name);
            this.twitterReplyTo.setAttribute('href', replyTo.url);
        } else {
            this.twitterReplyTo.setAttribute('hidden', 'true');
        }
        Scrapi.clearChildNodes(this.twitterContent).appendChild(
            document.createTextNode(this.scrap.getAttribute('content'))
        );
        let note = this.scrap.getAttribute('note');
        this.twitterNote.value = note;
        this.twitterNote.setAttribute('hidden', !note);
        this.twitterProperties.setAttribute(
            'class',
            ['decoration', 'color'].map(function(key) this.scrap.getAttribute(key), this).join(' ')
        );
    },

    formatTimestamp: function(str) {
        let date = Scrapi.parseDate(str);
        if (!date) return '';
        let result = (date.getHours() % 12) + ':' + (date.getMinutes() < 10 ? '0' : '') + date.getMinutes() + ' ';
        result += date.getHours() < 12 ? 'AM' : 'PM';
        result += ' ' + this.monthAbbrs[date.getMonth()];
        result += ' ' + date.getDate();
        return result;
    },
    monthAbbrs: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],

    toggleTwitterNote: function() {
        if (!this.scrap) return;
        let hidden = this.twitterNote.getAttribute('hidden') == 'true';
        this.twitterNote.setAttribute('hidden', hidden ? 'false' : 'true');
        if (hidden)
            this.twitterNote.focus();
    },

    showNichProperties: function() {
        if (!this.scrap) return;
        this.properties.selectedIndex = NICH_PROPERTY_INDEX;
        this.nichResNumber.setAttribute('value', this.scrap.getAttribute('res_number'));
        this.nichUserName.setAttribute('value', this.scrap.getAttribute('user_name'));
        this.nichUserMail.setAttribute('value', this.scrap.getAttribute('user_mail'));
        this.nichUserID.setAttribute('value', this.scrap.getAttribute('user_id'));
        this.nichTimestamp.setAttribute('value', this.formatTimestamp(this.scrap.getAttribute('posted_at')));
        this.nichTimestamp.setAttribute('href', this.scrap.getAttribute('url'));
        Scrapi.clearChildNodes(this.nichContent).appendChild(
            document.createTextNode(this.scrap.getAttribute('content'))
        );
        let note = this.scrap.getAttribute('note');
        this.nichNote.value = note;
        this.nichNote.setAttribute('hidden', !note);
        this.nichProperties.setAttribute(
            'class',
            ['decoration', 'color'].map(function(key) this.scrap.getAttribute(key), this).join(' ')
        );
    },

    toggleNichNote: function() {
        if (!this.scrap) return;
        let hidden = this.nichNote.getAttribute('hidden') == 'true';
        this.nichNote.setAttribute('hidden', hidden ? 'false' : 'true');
        if (hidden)
            this.nichNote.focus();
    },

    showTextProperties: function() {
        if (!this.scrap) return;
        this.properties.selectedIndex = TEXT_PROPERTY_INDEX;
        this.textContent.value = this.scrap.getAttribute('content');
        let sourceURL = this.scrap.getAttribute('source_url');
        let sourceTitle = this.scrap.getAttribute('source_title');
        this.textSourceURL.value = sourceURL;
        this.textSourceTitle.value = sourceTitle;
        let showSource = sourceURL || sourceTitle;
        this.textSource.setAttribute('hidden', showSource ? 'false' : 'true');
        this.textSourceLabel.setAttribute('class', showSource ? 'open' : 'close');
        this.textProperties.setAttribute(
            'class',
            ['decoration', 'color'].map(function(key) this.scrap.getAttribute(key), this).join(' ')
        );

    },

    toggleTextSource: function() {
        let visible = (this.textSource.getAttribute('hidden') == 'true');
        this.textSource.setAttribute('hidden', visible ? 'false' : 'true');
        this.textSourceLabel.setAttribute('class', visible ? 'open' : 'close');
    },

    onInputTextContent: function(event) {
        if (!this.scrap) return;
        this.scrap.setAttribute('content', event.target.value);
        this.scrap.setAttribute('label', (event.target.value || '').slice(0, 30));
    },
    onInputTextSourceURL: function(event) {
        if (!this.scrap) return;
        this.scrap.setAttribute('source_url', event.target.value);
    },
    onInputTextSourceTitle: function(event) {
        if (!this.scrap) return;
        this.scrap.setAttribute('source_title', event.target.value);
    },

    onInputNote: function(event) {
        if (!this.scrap) return;
        this.scrap.setAttribute('note', event.target.value);
    },
    
    
    // ==========
    // actions called from xul
    // ==========

    openNewTab: function() {
        this.scraps.addNewScrap();
    },
    closeTab: function() {
        this.closeTabAt(this.tabs.selectedIndex - 1);
    },
    closeTabAt: function(index) {
        this.scraps.update(function() {
            this.removeScrapAt(index);
            this.select(Math.min(index, this.length - 1), true);
        });
    },


    openSelectedEntries: function() {
        if (!this.scrap) return;
        this.scrap.openSelectedEntries();
    },
    removeSelectedEntries: function() {
        if (!this.scrap) return;
        this.scrap.removeSelectedEntries();
    },

    reloadSelectedEntries: function() {
        if (!this.scrap) return;
        this.scrap.reloadSelectedEntries();
    },

    selectAllEntries: function() {
        this.tree.view.selection.selectAll();
    },
    selectInvert: function() {
        // not implemented
        // this.tree.view.selection.invertSelection();
        let numRanges = this.tree.view.selection.getRangeCount();
        let start = new Object();
        let end = new Object();
        let selectedIndexes = [];
        let i = 0;
        let length = this.tree.view.rowCount;
        for (let t = 0; t < numRanges; t++){
            this.tree.view.selection.getRangeAt(t, start, end);
            for (;i < start.value && i < length; i++)
                selectedIndexes.push(i);
            i = end.value + 1;
        }
        for (;i < length; i++)
            selectedIndexes.push(i);
        this.tree.view.selection.clearSelection();
        selectedIndexes.forEach(function(index) {
            this.tree.view.selection.rangedSelect(index, index, true);
        }, this);
    },
    selectEntries: function(propName) {
        if (!this.scrap) return;
        let filter = this.getEntryPropertyFilter(propName);
        this.tree.view.selection.clearSelection();
        let entries = this.scrap.container.GetElements();
        let prop = this.scrap.getProperty(propName);
        let i = 0;
        while (entries.hasMoreElements()) {
            let attrs = {};
            attrs[propName] = this.scrap.getAttribute(prop, entries.getNext());
            if (filter(attrs)) {
                this.tree.view.selection.rangedSelect(i, i, true);
            }
            i++;
        }
    },

    insertText: function() {
        if (!this.scrap) return;
        this.scrap.insertTextAt('', '', '', this.tree.view.selection.currentIndex);
    },

    removeDuplicate: function() {
        if (!this.scrap) return;
        let removed = [];
        let entries = this.scrap.container.GetElements();
        while (entries.hasMoreElements()) {
            let res = entries.getNext();
            let url = this.scrap.getAttribute('url', res);
            if (url) {
                if (!(url in removed))
                    removed[url] = [];
                else
                    removed[url].push(res);
            }
        }
        this.scrap.update(function() {
            for each (let resources in removed) {
                resources.forEach(function(res) {
                    this.removeEntryAt(0, res);
                }, this);
            }
        });
    },

    extractEntries: function(propName) {
        if (!this.scrap) return;
        if (propName) {
            this.scrap.extractEntries(this.getEntryPropertyFilter(propName));
        } else {
            this.scrap.extractEntries();
        }
    },
    getEntryPropertyFilter: function(propName) {
        let targets = {};
        this.scrap.getSelectedEntries().forEach(function([i, res]) {
            let value = this.scrap.getAttribute(propName, res);
            if (value)
                targets[value] = true;
        }, this);
        return function(attrs) {
            return attrs[propName] && (attrs[propName] in targets);
        };
    },

    extractReplyEntries: function() {
        if (!this.scrap) return;
        this.scrap.insertReplyEntries();
    },

    insertLinkAt: function(url, index) {
        if (!this.scrap) return;
        this.scrap.insertLinkAt(url, index);
    },

    sortElements: function(prop, desc) {
        if (!this.scrap) return;
        this.scrap.sortElements(prop, desc);
    },

    setResponse: function(isRes) {
        if (!this.scrap) return;
        this.scrap.setAttributeForSelectedElements('mode', isRes ? 'response' : '');
    },

    setBold: function(isBold) {
        if (!this.scrap) return;
        this.scrap.setAttributeForSelectedElements('decoration', isBold ? 'bold' : '');
    },

    setColor: function(colorName) {
        if (!this.scrap) return;
        this.scrap.setAttributeForSelectedElements('color', colorName);
    },

    onClickLink: function(event, url) {
        if (event.button != 0) return;
        url = url || event.target.href;
        if (url) {
            let browser = Scrapi.getBrowser();
            if (browser)
                browser.selectedTab = browser.addTab(url);
        }
        event.preventDefault();
    },

    upload: function() {
        if (!this.scrap) return;
        let content = this.scrap.toString();
        if (!content) return;

        let onerror = Scrapi.bind(function(e) {
            this.toolLoading.setAttribute('hidden', 'true');
            alert('投稿に失敗しました。');
        }, this);
        let onload = Scrapi.bind(function(e) {
            try {
                let info = JSON.parse(e.target.responseText);
                if (info.error) throw null;
                let browser = Scrapi.getBrowser();
                 browser.selectedTab = browser.addTab(info.new_url);
                this.toolLoading.setAttribute('hidden', 'true');
            } catch (error) {
                onerror.call(this, e);
            }
        }, this);
        this.toolLoading.setAttribute('hidden', 'false');
        Scrapi.S.uconv.charset = 'UTF-8';
        Scrapi.httpRequest(UPLOAD_URL, {
            method: 'POST',
            headers: {
                'Content-type': 'application/rdf+xml',
                'Content-length': content.length
            },
            data: Scrapi.S.uconv.ConvertToUnicode(content),
            onload: onload,
            onerror: onerror
        });
    },

    
    // ==========
    // element getter
    // ==========
    
    defineElementGetter: function(name) {
        let id = 'scrapi' + Scrapi.capitalize(name);
        let self = this;
        this.__defineGetter__(name, function() {
            let element = document.getElementById(id);
            self.__defineGetter__(name, function() element);
            return element;
        });
    }

};

[
    'tabs', 'tree',
    'properties',
    'twitterProperties', 'twitterUserImage', 'twitterContent', 'twitterReplyTo',
    'twitterTimestamp', 'twitterUserName', 'twitterToggleNote', 'twitterNote',
    'nichProperties', 'nichResNumber', 'nichUserName', 'nichUserMail', 'nichContent',
    'nichUserID', 'nichTimestamp', 'nichToggleNote', 'nichNote',
    'textContent', 'textSourceURL', 'textSourceTitle', 'textSource', 'textSourceLabel',
    'textProperties',
    'menuBold', 'menuResponse', 'menuExtractNichUser', 'menuExtractNichID', 'menuExtractTwitterUser',
    'menuSelectNichUser', 'menuSelectNichID', 'menuSelectTwitterUser', 'menuExtractSeparator',
    'menuReloadSeparator', 'menuReload',
    'menuExtractNichReply', 'menuExtractTwitterReply',
    'toolLoading'
].forEach(function(name) {
    Scrapi.Page.defineElementGetter(name);
});

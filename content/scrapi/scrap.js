// require core.js, extract.js


// ========================================
// scrap container rdf object : Scrapi.RDF
// ========================================

Scrapi.Scraps = function() {
    Scrapi.RDF.call(this, this.dataSourceFile, SCRAPS_RESOURCE_NAME);
    if (this.length == 0)
        this.addNewScrap();
};
Scrapi.Scraps.prototype.__proto__ = Scrapi.RDF.prototype;
Scrapi.extend(Scrapi.Scraps.prototype, {

    currentScrap: null,
    
    get dataSourceFile() {
        let file = Scrapi.dataDir;
        file.append(SCRAPS_RDF_FILENAME);
        return file;
    },


    addNewScrap: function() {
        return this.update(function() {
            let key = this.addElement({
                label: this.getUniqueScrapLabel()
            });
            this.assert(this.getElementFor(key), 'key', key);
            let scrap = (new Scrapi.Scrap(key)).flush();
            this.select(this.length - 1, true);
            return scrap;
        });
    },

    getUniqueScrapLabel: function() {
        let count = this.length + 1;
        while (true) {
            let label = SCRAP_LABEL_BASENAME + count;
            if (!this.dataSource.ArcLabelsIn(this.getProperty('label')).hasMoreElements())
                return label;
            count++;
        }
    },

    removeScrapAt: function(index) {
        let scrap = this.getScrapAt(index);
        if (!scrap) return;
        scrap.destroy();
        this.removeElementAt(index);
        if (this.length == 0) {
            this.addNewScrap();
        }
    },

    getScrapAt: function(index) {
        let res = this.getElementAt(index);
        if (!res) return null;
        return new Scrapi.Scrap(this.getTargetValue(res, 'key'));
    },

    
    // ==========
    // selection
    // xul -> Scrapi.Page -> Scrapi.Scraps -> Scrapi.Events -> others
    // ==========

    select: function(index, save) {
        let selected = this.getScrapAt(index);
        if (!selected) return;
        if (save) {
            this.update(function() {
                let current = this.dataSource.GetSource(this.getProperty('selected'), this.getLiteral('true'), true);
                if (current) {
                    this.unassert(current, 'selected', 'true');
                }
                this.assert(this.getElementFor(selected.key), 'selected', 'true');
            });
        }
        this.currentScrap = selected;
        this.notify(SELECTED_SCRAP_CHANGE_KEY, index);
    }

});


// ========================================
// scrap rdf object : Scrapi.RDF
// ========================================

Scrapi.Scrap = function(key) {
    this.key = key;
    Scrapi.RDF.call(this, this.getDataSourceFile(), this.appendResourceName(SCRAP_RESOURCE_BASENAME, key));
};
Scrapi.Scrap.prototype.__proto__ = Scrapi.RDF.prototype;
Scrapi.extend(Scrapi.Scrap.prototype, {

    // ==========
    // properties
    // ==========
    getDataSourceFile: function() {
        let file = Scrapi.dataDir;
        file.append(SCRAP_RDF_BASENAME + '-' + this.key + '.rdf');
        return file;
    },

    toString: function() {
        this.flush();
        return Scrapi.readFile(this.getDataSourceFile());
    },


    // ==========
    // container operations
    // ==========
    
    destroy: function() {
        let file = this.getDataSourceFile();
        if (file.exists()) file.remove(true);
        Scrapi.S.rdf.UnregisterDataSource(this.dataSource);
    },

    removeEntryAt: function(i, res) {
        if (!res) res = this.getElementAt(i);
        this.removeElement(res);
        this.notify(ENTRY_REMOVE_KEY, i);
    },

    insertEntryAt: function(attrs, index) {
        this.insertElementAt(attrs, index);
        index = index >= 0 ? index : this.length - 1;
        this.notify(ENTRY_ADD_KEY, index);

        if (attrs.status == 'loading') {
            let res = this.getElementAt(index);
            this.loadEntry(res, attrs);
        }

    },

    moveEntry: function(from, to) {
        this.update(function() {
            let fromRes = this.container.RemoveElementAt(from + 1, true);
            this.container.InsertElementAt(fromRes, to + 1, true);
        }, this);
        this.notify(ENTRY_ADD_KEY, to);
    },

    modifyEntry: function(resource, params) {
        this.updateWithoutBatch(function() {
            this.removeProperties(resource);
            this.addProperties(resource, params);
            this.notify(ENTRY_MODIFY_KEY, this.selection ? this.selection.currentIndex : -1);
        });
    },


    // ==========
    // entry insertion by link
    // ==========
    
    insertLinkAt: function(url, index) {
        let attrs = this.getAttributesForURL(url);
        if (attrs) {
            this.insertEntryAt(attrs, index);
        }
    },

    canAcceptURL: function(url) {
        return !!Scrapi.Extract.parseURL(url);
    },
    getAttributesForURL: function(url) {
        return this.addDefaultAttributes(Scrapi.Extract.getContent(url) || Scrapi.Extract.parseURL(url));
    },

    addDefaultAttributes: function(attrs) {
        attrs = attrs || {};
        attrs.scrapped_at = (new Date()).toUTCString();
        return attrs;
    },

    loadEntry: function(res, attrs) {
        if (attrs.type == 'twitter') {
            this.loadTwitterEntry(res, attrs);
        }
    },
    loadTwitterEntry: function(res, attrs) {
        if (!attrs.status_id) return;
        let onerror = Scrapi.bind(function(e) {
            this.modifyProperty(res, 'status', 'error');
        }, this);
        let onload = Scrapi.bind(function(e) {
            try {
                let info = JSON.parse(e.target.responseText);
                if (info.error) throw null;
                let content = this.unescapeTwitterContent(info.text);
                let params = {
                    type: 'twitter',
                    status_id: attrs.status_id,
                    url: 'http://twitter.com/' + info.user.screen_name + '/status/' + info.id,
                    user_name: info.user.screen_name,
                    label: info.user.screen_name + ': ' + content,
                    content: content,
                    // posted_at: Scrapi.parseDate(info.created_at).toUTCString(),
                    posted_at: info.created_at,
                    scrapped_at: attrs.scrapped_at
                };
                if (info.in_reply_to_status_id && info.in_reply_to_screen_name) {
                    params.reply_to = 'http://twitter.com/' + info.in_reply_to_screen_name + '/status/' + info.in_reply_to_status_id;
                }
                this.modifyEntry(res, params);
                this.notify(ENTRY_LOAD_KEY, params);
            } catch(error) {
                onerror.call(this, e);
            }
        }, this);
        Scrapi.httpRequest('http://twitter.com/statuses/show/' + attrs.status_id + '.json', {
            onload: onload,
            onerror: onerror
        });
    },
    unescapeTwitterContent: function(str) {
        return str.replace(/&gt;/g, '>').replace(/&lt;/g, '<');
    },


    // ==========
    // selection
    // xul -> Scrapi.Page -> Scrapi.Scrap -> Scrapi.Events -> others
    // ==========

    select: function(selection) {
        this.selection = selection;
        this.selectedEntry = this.getElementAt(this.selection.currentIndex);
        this.notify(SELECTED_ENTRY_CHANGE_KEY, '');
    },

    getSelectedEntries: function() {
        if (!this.selection) return [];
        let numRanges = this.selection.getRangeCount();
        if (numRanges <= 0) return [];
        let results = [];
        let entries = this.container.GetElements();
        let length = this.length;
        let i = 0;
        let start = new Object();
        let end = new Object();
        for (let t = 0; t < numRanges; t++){
            this.selection.getRangeAt(t, start, end);
            for (;i < start.value && i < length; i++)
                entries.getNext();
            for (; i <= end.value && i < length; i++)
                results.push([i, entries.getNext()]);
        }
        return results;
    },

    getSelectedEntry: function() {
        return this.selectedEntry;
    },

    getAttribute: function(prop, entry) {
        entry = entry || this.getSelectedEntry();
        if (!entry) return '';
        return this.getTargetValue(entry, prop);
    },
    setAttribute: function(prop, value, entry) {
        entry = entry || this.getSelectedEntry();
        if (!entry) return;
        this.updateWithoutBatch(function() {
            this.modifyProperty(entry, prop, value);
        });
    },

    // ==========
    // actions
    // ==========

    openSelectedEntries: function() {
        let browser = Scrapi.getBrowser();
        if (!browser) return;
        this.getSelectedEntries().forEach(function([i, res]) {
            let url = this.getAttribute('url', res);
            if (url)
                browser.selectedTab = browser.addTab(url);
        }, this);        
    },
    removeSelectedEntries: function() {
        this.update(function() {
            this.getSelectedEntries().reverse().forEach(function([i, res]) {
                this.removeEntryAt(i, res);
            }, this);
        });
    },

    extractEntries: function(filter) {
        let entries = Scrapi.Extract.getAllContents();
        if (entries.length == 0) return;

        let existsURLs = {};
        let urlProp = this.getProperty('url');
        let all = this.container.GetElements();
        while (all.hasMoreElements()) {
            let url = this.getAttribute(urlProp, all.getNext());
            if (url) existsURLs[url] = true;
        }

        this.update(function() {
            entries.forEach(function(entry) {
                entry = this.addDefaultAttributes(entry);
                if (!existsURLs[entry.url]) {
                    if (!filter || filter(entry)) {
                        this.insertEntryAt(entry, -1);
                    }
                }
            }, this);
        });
    },

    sortElements: function(prop, desc) {
        let entriesWithTime = [];
        let entries = this.container.GetElements();
        while (entries.hasMoreElements()) {
            let entry = entries.getNext();
            let time = Date.parse(this.getAttribute(prop, entry));
            if (isNaN(time))
                time = desc ? 0 : Number.MAX_VALUE;  // put last if timestamp doesnt exist
            entriesWithTime.push([entry, time]);
        }
        entriesWithTime.sort(desc ? function(a, b) { return b[1] - a[1]; } : function(a, b) { return a[1] - b[1]; });
        this.update(function() {
            let containerResource = this.getResource(this.containerResourceName);
            let items = this.dataSource.ArcLabelsOut(containerResource);
            while (items.hasMoreElements()) {
                let item = items.getNext();
                let target = this.dataSource.GetTarget(containerResource, item, true);
                this.dataSource.Unassert(containerResource, item, target);
            }
            this.reloadContainer();
            entriesWithTime.forEach(function([resource, time]) {
                this.container.AppendElement(resource);
            }, this);
        }, this);
    },

    setAttributeForSelectedElements: function(prop, value) {
        this.updateWithoutBatch(function() {
            this.getSelectedEntries().forEach(function([i, res]) {
                this.modifyProperty(res, prop, value);
                this.notify(ENTRY_MODIFY_KEY, i);
            }, this);
        });
    },

    reloadSelectedEntries: function() {
        this.getSelectedEntries().forEach(function([i, res]) {
            if (this.getAttribute('type', res) == 'twitter') {
                this.updateWithoutBatch(function() {
                    this.modifyProperty(res, 'status', 'loading');
                });
                this.loadTwitterEntry(res, {
                    status_id: this.getAttribute('status_id', res),
                    scrapped_at: this.getAttribute('scrapped_at', res)
                });
            }
        }, this);
    },

    insertReplyEntries: function() {
        let repliable = [];
        let nichEnabled = (Scrapi.Extract.getCurrentPageType() == 'nich');
        let entryIndexesForRequiredResNumber = {};
        let nichNeedsExtract = false;
        this.getSelectedEntries().forEach(function([i, res]) {
            let type = this.getAttribute('type', res);
            if (type == 'twitter') {
                let replyTo = this.getAttribute('reply_to', res);
                if (replyTo) repliable.push([i, 'twitter', replyTo]);
            } else if (nichEnabled && type == 'nich') {
                let content = this.getAttribute('content', res);
                if (content) {
                    let resNumbers = Scrapi.Extract.getNichResNumbersFromContent(content);
                    if (resNumbers.length > 0) {
                        nichNeedsExtract = true;
                        resNumbers.forEach(function(resNo) {
                            if (!(resNo in entryIndexesForRequiredResNumber))
                                entryIndexesForRequiredResNumber[resNo] = i;
                        });
                        repliable.push([i, 'nich']);
                    }
                }
            }
        }, this);

        let entryAttributesForIndex = {};
        if (nichNeedsExtract) {
            Scrapi.Extract.getAllContents().forEach(function(attrs) {
                if (attrs.res_number in entryIndexesForRequiredResNumber) {
                    let entryIndex = entryIndexesForRequiredResNumber[attrs.res_number];
                    (entryAttributesForIndex[entryIndex] = entryAttributesForIndex[entryIndex] || []).push(attrs);
                }
            }, this);
            
        }

        this.update(function() {
            repliable.reverse().forEach(function([i, type, replyTo]) {
                if (type == 'twitter') {
                    this.insertLinkAt(replyTo, i);
                } else if (type == 'nich') {
                    let attrs = entryAttributesForIndex[i];
                    if (attrs) {
                        attrs.reverse().forEach(function(attr) {
                            this.insertEntryAt(this.addDefaultAttributes(attr), i);
                        }, this);
                    }
                }
            }, this);
        });
    }
});

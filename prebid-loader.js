(function() {
    'use strict';

    const CONFIG_URL = 'prebid-config.json';
    const FAILSAFE_TIMEOUT = 5000;
    window.pbjs = window.pbjs || {};
    window.pbjs.que = window.pbjs.que || [];
    var pbjs = window.pbjs;

     window.prebidConfig = null;
    function updateStatus(message, type) {
        const statusEl = document.getElementById('status');
        if (statusEl) {
            statusEl.textContent = message;
            statusEl.className = 'status ' + type;
        }
    }

    function debugLog(content, type) {
        const debugOutput = document.getElementById('debugOutput');
        if (debugOutput) {
            const entry = document.createElement('div');
            entry.className = 'bid-info' + (type ? ' ' + type : '');
            if (typeof content === 'object') {
                entry.innerHTML = '<pre>' + JSON.stringify(content, null, 2) + '</pre>';
            } else {
                entry.innerHTML = '<pre>' + content + '</pre>';
            }
            debugOutput.appendChild(entry);
        }
        console.log('[Prebid Loader]', content);
    }

    function clearDebug() {
        const debugOutput = document.getElementById('debugOutput');
        if (debugOutput) {
            debugOutput.innerHTML = '';
        }
    }


    function resolveMediaTypes(mediaTypesRef, config) {
        if (!mediaTypesRef || !config.mediaTypes) {
            return null;
        }

        const parts = mediaTypesRef.split('.');
        if (parts.length !== 2) {
            console.warn('Invalid mediaTypesRef format:', mediaTypesRef);
            return null;
        }

        const [type, preset] = parts;
        const presetConfig = config.mediaTypes[type]?.[preset];

        if (!presetConfig) {
            console.warn('MediaTypes preset not found:', mediaTypesRef);
            return null;
        }

       
        if (type === 'banner') {
            return {
                banner: {
                    sizes: presetConfig.sizes
                }
            };
        } else if (type === 'video') {
            return {
                video: { ...presetConfig }
            };
        }

        return null;
    }

  
    function buildAdUnits(config) {
        if (!config.adUnits || !Array.isArray(config.adUnits)) {
            console.error('No adUnits found in config');
            return [];
        }

        return config.adUnits.map(unit => {
            const adUnit = {
                code: unit.code,
                bids: unit.bids || []
            };

            if (unit.mediaTypesRef) {
                adUnit.mediaTypes = resolveMediaTypes(unit.mediaTypesRef, config);
            } else if (unit.mediaTypes) {
                adUnit.mediaTypes = unit.mediaTypes;
            }

            return adUnit;
        });
    }


    function applyGlobalConfig(config) {
        const settings = {};

        if (config.globalConfig) {
            if (config.globalConfig.debug !== undefined) {
                settings.debug = config.globalConfig.debug;
            }
            if (config.globalConfig.bidderTimeout) {
                settings.bidderTimeout = config.globalConfig.bidderTimeout;
            }
            if (config.globalConfig.priceGranularity) {
                settings.priceGranularity = config.globalConfig.priceGranularity;
            }
            if (config.globalConfig.enableSendAllBids !== undefined) {
                settings.enableSendAllBids = config.globalConfig.enableSendAllBids;
            }
            if (config.globalConfig.useBidCache !== undefined) {
                settings.useBidCache = config.globalConfig.useBidCache;
            }
        }


        if (config.consentManagement) {
            if (config.consentManagement.gdpr) {
                settings.consentManagement = config.consentManagement.gdpr;
            }
            if (config.consentManagement.usp) {
                settings.consentManagement = settings.consentManagement || {};
                settings.consentManagement.usp = config.consentManagement.usp;
            }
        }

    
        if (config.schain) {
            settings.schain = config.schain;
        }

     
        if (config.cache) {
            settings.cache = config.cache;
        }

        if (config.userSync) {
            settings.userSync = config.userSync;
        }

        return settings;
    }


    function renderAd(adUnitCode) {
        const adContainer = document.getElementById(adUnitCode);
        if (!adContainer) return;

        const highestBid = pbjs.getHighestCpmBids(adUnitCode)[0];

        if (highestBid) {
      
            adContainer.innerHTML = '';

       
            const iframe = document.createElement('iframe');
            iframe.style.border = 'none';
            iframe.width = highestBid.width || 300;
            iframe.height = highestBid.height || 250;
            iframe.scrolling = 'no';
            adContainer.appendChild(iframe);

       
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write(highestBid.ad);
            iframeDoc.close();

            debugLog(`Rendered ad for ${adUnitCode}: ${highestBid.bidder} @ $${highestBid.cpm.toFixed(2)}`, 'winning');
        } else {
            adContainer.innerHTML = '<span class="ad-placeholder">No bids received</span>';
            debugLog(`No winning bid for ${adUnitCode}`, 'no-bid');
        }
    }


    function handleBidResponse() {
        clearDebug();
        debugLog('=== Auction Complete ===');

        const allBids = pbjs.getBidResponses();
        const adUnitCodes = Object.keys(allBids);

        if (adUnitCodes.length === 0) {
            debugLog('No bid responses received', 'no-bid');
        }

        adUnitCodes.forEach(adUnitCode => {
            const bids = allBids[adUnitCode].bids || [];
            debugLog(`\n--- ${adUnitCode} ---`);

            if (bids.length === 0) {
                debugLog('  No bids', 'no-bid');
            } else {
                bids.forEach(bid => {
                    debugLog({
                        bidder: bid.bidder,
                        cpm: bid.cpm.toFixed(4),
                        size: `${bid.width}x${bid.height}`,
                        timeToRespond: bid.timeToRespond + 'ms',
                        statusMessage: bid.statusMessage
                    });
                });
            }

            renderAd(adUnitCode);
        });

    
        const noBids = pbjs.getNoBids();
        if (Object.keys(noBids).length > 0) {
            debugLog('\n=== No Bids ===');
            Object.entries(noBids).forEach(([adUnitCode, bidders]) => {
                bidders.forEach(noBid => {
                    debugLog(`${adUnitCode}: ${noBid.bidder} - no bid`, 'no-bid');
                });
            });
        }

        updateStatus('Auction complete - bids received', 'success');
    }


    function requestBids(adUnits) {
        updateStatus('Requesting bids...', 'loading');
        clearDebug();
        debugLog('Starting bid request for ' + adUnits.length + ' ad units...');

        pbjs.que.push(function() {
            pbjs.requestBids({
                adUnits: adUnits,
                bidsBackHandler: handleBidResponse,
                timeout: window.prebidConfig?.globalConfig?.bidderTimeout || 3000
            });
        });
    }


    function initPrebid(config) {
        window.prebidConfig = config;

        pbjs.que.push(function() {
           
            const settings = applyGlobalConfig(config);
            debugLog('Applying Prebid config:');
            debugLog(settings);
            pbjs.setConfig(settings);

         
            const allAdUnits = buildAdUnits(config);
            const adUnits = allAdUnits.filter(unit => document.getElementById(unit.code));
            debugLog('Built ' + allAdUnits.length + ' ad units, ' + adUnits.length + ' have matching DOM elements');
            debugLog(adUnits);

         
            window.prebidAdUnits = adUnits;

        
            const refreshBtn = document.getElementById('refreshBids');
            if (refreshBtn) {
                refreshBtn.disabled = false;
                refreshBtn.addEventListener('click', function() {
                    requestBids(window.prebidAdUnits);
                });
            }

        
            const showConfigBtn = document.getElementById('showConfig');
            const configDisplay = document.getElementById('configDisplay');
            const configJson = document.getElementById('configJson');
            if (showConfigBtn && configDisplay && configJson) {
                showConfigBtn.addEventListener('click', function() {
                    configJson.textContent = JSON.stringify(config, null, 2);
                    configDisplay.style.display = configDisplay.style.display === 'none' ? 'block' : 'none';
                });
            }

        
            requestBids(adUnits);
        });
    }


    function loadConfig() {
        updateStatus('Loading configuration from ' + CONFIG_URL + '...', 'loading');

 
        const cacheBuster = CONFIG_URL + '?v=' + Date.now();
        fetch(cacheBuster)
            .then(response => {
                if (!response.ok) {
                    throw new Error('HTTP error! status: ' + response.status);
                }
                return response.json();
            })
            .then(config => {
                updateStatus('Configuration loaded successfully', 'success');
                debugLog('Configuration loaded:');
                debugLog({ version: config.version, modules: config.modules });
                initPrebid(config);
            })
            .catch(error => {
                updateStatus('Error loading configuration: ' + error.message, 'error');
                debugLog('Failed to load config: ' + error.message, 'no-bid');
                console.error('Config load error:', error);
            });
    }


    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', loadConfig);
    } else {
        loadConfig();
    }

})();

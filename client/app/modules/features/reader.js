/**
 * @fileoverview Reader module for handling document title, progress tracking, table of contents, and pagination.
 *
 * This module provides functions to set the document title, manage reading progress, process the table of contents,
 * display current page content, and generate pagination controls.
 *
 * @module client/app/modules/features/reader
 * @requires client/app/config/index
 * @requires client/app/modules/text/text-processor
 * @requires client/app/modules/features/footnotes
 * @requires client/app/utils/base
 * @requires client/app/utils/helpers-reader
 */

import * as CONFIG from "../../config/index.js";
import { TextProcessor } from "../text/text-processor.js";
import { getFootnotes } from "./footnotes.js";
import { getSizePrecise, outerHeight, triggerCustomEvent } from "../../utils/base.js";
import { GetScrollPositions, setHistory, setChapterTitleActive } from "../../utils/helpers-reader.js";

/**
 * Reader module for handling document title, progress tracking, table of contents, and pagination.
 * @public
 * @namespace
 */
export const reader = {
    /**
     * Size of 1em in pixels for the content container and TOC container
     * @type {number}
     * @private
     */
    EM_IN_PX_CONTENT: getSizePrecise("1em", CONFIG.DOM_ELEMENT.CONTENT_CONTAINER),
    EM_IN_PX_TOC: getSizePrecise("1em", CONFIG.DOM_ELEMENT.TOC_CONTAINER),

    /**
     * Initializes the table of contents (TOC)
     * @public
     */
    initTOC() {
        // Remove the old event listener if it exists
        if (this._handleTOCClickBound) {
            CONFIG.DOM_ELEMENT.TOC_CONTAINER.removeEventListener("click", this._handleTOCClickBound);
        }
        // Bind the event handler and save the reference
        this._handleTOCClickBound = this._handleTOCClick.bind(this);
        CONFIG.DOM_ELEMENT.TOC_CONTAINER.addEventListener("click", this._handleTOCClickBound);
    },

    /**
     * Processes the table of contents (TOC) and creates clickable links for each chapter.
     * @public
     */
    processTOC() {
        const tocScroller = document.createElement("div");
        tocScroller.id = "tocScroller";

        const tocConfig = {
            itemHeight: reader.EM_IN_PX_TOC * 2.8, // refer to ui.css - 1.2em (font size) + 0.3em (top margin) + 1.3em (bottom margin) = 2.8em
            total: CONFIG.VARS.ALL_TITLES.length,
            reverse: false,
            scrollerTagName: "div",
            scroller: tocScroller,
            latestTitleIndex: -1,
            latestLineNum: -1,

            generate(i) {
                const titleContainer = document.createElement("div");

                if (CONFIG.VARS.ALL_TITLES && CONFIG.VARS.ALL_TITLES.length > 0) {
                    this.latestTitleIndex = i;
                    const [title, lineNum, shortTitle, isCustomOnly] = CONFIG.VARS.ALL_TITLES[i];
                    this.latestLineNum = lineNum;
                    // console.log(`[${i}/${CONFIG.VARS.ALL_TITLES.length}] ${lineNum} - ${title}`);

                    // Check if the title is already present in the DOM to prevent duplicates
                    // if (CONFIG.DOM_ELEMENT.GET_TITLE(lineNum)) {
                    //     return;
                    // }

                    // To preserve toc-active class after scrolling
                    const isCurrentTitleActive = lineNum === CONFIG.VARS.ACTIVE_TITLE;
                    const activeTitleToken = isCurrentTitleActive ? " toc-active" : "";

                    titleContainer.classList.add("chapter-title-container");
                    titleContainer.classList.add(isCustomOnly ? "title-custom" : "title-base");
                    if (isCurrentTitleActive) {
                        titleContainer.classList.add(activeTitleToken.trim());
                    }
                    titleContainer.id = `title_${lineNum}`;
                    titleContainer.dataset.index = i;
                    titleContainer.dataset.lineNum = lineNum;
                    titleContainer.innerHTML = `
                        <a id="a${lineNum}_bull" href="#line${lineNum}" class="prevent-select toc-bullet${activeTitleToken}" style="cursor: pointer;"></a>
                        <a id="a${lineNum}" href="#line${lineNum}" class="prevent-select toc-text title-original${activeTitleToken}" style="cursor: pointer;">${title}</a>
                        <a id="a${lineNum}_alt" href="#line${lineNum}" class="prevent-select toc-text title-shortened hidden${activeTitleToken}" style="cursor: pointer;">${shortTitle}</a>
                    `;
                }

                return titleContainer;
            },

            afterRender() {
                if (CONFIG.VARS.ALL_TITLES && CONFIG.VARS.ALL_TITLES.length > 0) {
                    const height = parseFloat(tocScroller.style.height);
                    const percentage = (tocContainer.scrollTop / height) * 100;

                    // console.log(`Looking for #title_${this.latestLineNum}`); // Use the correct selector

                    // Create a MutationObserver to wait for DOM updates
                    const observer = new MutationObserver((mutations, obs) => {
                        const element = document.querySelector(`#title_${this.latestLineNum}`);
                        if (element) {
                            // DOM elements are ready
                            // console.log(`Found #title_${this.latestLineNum}`);
                            obs.disconnect(); // Stop observing

                            // Trigger tocRendered event
                            triggerCustomEvent("tocRendered", {
                                percentage,
                                index: this.latestTitleIndex,
                                lineNum: this.latestLineNum,
                            });
                        }
                    });

                    // Start observing the container for changes
                    observer.observe(tocContainer, {
                        childList: true, // Monitor direct child nodes
                        subtree: true, // Monitor all descendants
                    });

                    // Fallback timeout in case the observer doesn't detect changes
                    setTimeout(() => {
                        const element = document.querySelector(`#title_${this.latestLineNum}`);
                        if (element) {
                            // console.log(`Fallback: Found #title_${this.latestLineNum} after timeout`);
                            observer.disconnect();

                            // Trigger tocRendered event
                            triggerCustomEvent("tocRendered", {
                                percentage,
                                index: this.latestTitleIndex,
                                lineNum: this.latestLineNum,
                            });
                        } else {
                            console.log(
                                `Warning: ToC not fully rendered even after timeout. latestTitleIndex: ${this.latestTitleIndex}, latestLineNum: ${this.latestLineNum}`
                            );
                        }
                    }, 100); // Increase timeout duration if necessary
                }
            },
        };

        const tocContainer = document.createElement("div");
        tocContainer.id = "tocList";

        // window.onresize = (e) => {
        //     tocList.refresh(tocContainer, tocConfig);
        // };

        const tocList = HyperList.create(tocContainer, tocConfig);
        // console.log(tocList);
        CONFIG.DOM_ELEMENT.TOC_CONTAINER.replaceChildren(tocContainer);

        return tocList;
    },

    /**
     * Displays the content of the current page based on the current page index and configuration settings.
     * @public
     */
    showCurrentPageContent() {
        try {
            // // Update column layout based on screen aspect ratio
            // this._updateColumnLayout();

            // // Add window size change listener
            // window.removeEventListener("resize", this._updateColumnLayout.bind(this));
            // window.addEventListener("resize", this._updateColumnLayout.bind(this));

            const contentChunks = CONFIG.VARS.FILE_CONTENT_CHUNKS;
            const maxLines = contentChunks.length;
            const startIndex = CONFIG.VARS.PAGE_BREAKS[CONFIG.VARS.CURRENT_PAGE - 1] || 0;
            const endIndex = CONFIG.VARS.PAGE_BREAKS[CONFIG.VARS.CURRENT_PAGE] || maxLines;
            // console.log("pageBreaks: ", CONFIG.VARS.PAGE_BREAKS);
            // console.log("currentPage: ", CONFIG.VARS.CURRENT_PAGE);
            // console.log("startIndex: ", startIndex, "endIndex: ", endIndex);

            CONFIG.DOM_ELEMENT.CONTENT_CONTAINER.innerHTML = "";

            // process line by line - fast
            if (maxLines > 0) {
                for (let j = startIndex; j < Math.min(endIndex, maxLines); j++) {
                    const currentLine = contentChunks[j];
                    if (typeof currentLine === "object") {
                        // v1.6.4 and above
                        const [processedContent, lineType] = TextProcessor.createDOM(currentLine);
                        CONFIG.DOM_ELEMENT.CONTENT_CONTAINER.appendChild(processedContent);
                    } else {
                        // v1.6.3 and below
                        if (currentLine.trim()) {
                            const [processedContent, lineType] = TextProcessor.processAndCreateDOM(
                                currentLine,
                                j,
                                j < CONFIG.VARS.TITLE_PAGE_LINE_NUMBER_OFFSET || j === maxLines - 1
                            );
                            CONFIG.DOM_ELEMENT.CONTENT_CONTAINER.appendChild(processedContent);
                        }
                    }
                }
            }

            // set up footnote
            getFootnotes();
        } catch (error) {
            console.error("Error showing page content:", error);
        }
    },

    /**
     * Generates pagination controls for navigating through pages.
     * @public
     */
    generatePagination() {
        // Save the existing processing indicator if it exists
        const existingProcessing = CONFIG.DOM_ELEMENT.PAGINATION_INDICATOR;

        CONFIG.DOM_ELEMENT.PAGINATION_CONTAINER.innerHTML = "";
        // CONFIG.DOM_ELEMENT.PAGINATION_CONTAINER.style.borderColor = CONFIG.RUNTIME_VARS.STYLE.borderColor;
        const paginationList = document.createElement("div");
        paginationList.classList.add("pagination");

        const showPages = this._getPageList(
            CONFIG.VARS.TOTAL_PAGES,
            CONFIG.VARS.CURRENT_PAGE,
            parseInt(CONFIG.RUNTIME_VARS.STYLE.ui_numPaginationItems),
            CONFIG.VARS.IS_PROCESSING
        );

        for (let i = 1; i <= showPages.length; i++) {
            // Add a prev page button
            if (showPages[i - 1] === 1) {
                const paginationItem_prev = document.createElement("div");
                paginationItem_prev.id = "pagePrev";
                const tempItem = document.createElement("a");
                tempItem.href = "#";
                tempItem.addEventListener("click", (e) => {
                    e.preventDefault();
                    this.gotoPage(CONFIG.VARS.CURRENT_PAGE - 1, "bottom");
                });
                tempItem.classList.add("prevent-select", "page");
                tempItem.innerText = "«";
                paginationItem_prev.appendChild(tempItem);

                if (CONFIG.VARS.CURRENT_PAGE === 1) {
                    paginationItem_prev.classList.add("disabledbutton");
                }
                paginationList.appendChild(paginationItem_prev);
            }

            if (showPages[i - 1] === 0) {
                // Add a page jump input field
                const paginationItem = document.createElement("div");
                paginationItem.id = `pageJumpInput_${i - 1}`;
                const tempItem = document.createElement("a");
                const tempInput = document.createElement("input");

                tempItem.href = "#!";
                tempInput.type = "text";
                tempInput.classList.add("jumpInput");
                tempInput.placeholder = "···";
                tempInput.size = 1;
                tempInput.id = tempInput.name = `pageJumpInput_input_${i - 1}`;

                tempInput.addEventListener("input", (e) => {
                    e.target.size = e.target.value.length || 1;
                });
                tempInput.addEventListener("keypress", this.gotoPageInputField.bind(this));

                tempItem.appendChild(tempInput);
                paginationItem.appendChild(tempItem);
                paginationList.appendChild(paginationItem);
            } else {
                // Add a page number button
                const paginationItem = document.createElement("div");
                paginationItem.id = `pageJump_${i - 1}`;
                const tempItem = document.createElement("a");
                tempItem.href = "#";
                tempItem.classList.add("prevent-select", "page");
                tempItem.innerText = showPages[i - 1];
                tempItem.addEventListener("click", (e) => {
                    e.preventDefault();
                    this.gotoPage(parseInt(e.target.innerHTML));
                });
                paginationItem.appendChild(tempItem);

                if (showPages[i - 1] === CONFIG.VARS.CURRENT_PAGE) {
                    paginationItem.classList.add("active");
                    paginationItem.children[0].classList.add("active");
                }
                paginationList.appendChild(paginationItem);
            }

            // Add a next page button
            if (showPages[i - 1] === CONFIG.VARS.TOTAL_PAGES) {
                const paginationItem_next = document.createElement("div");
                paginationItem_next.id = "pageNext";
                const tempItem = document.createElement("a");
                tempItem.href = "#";
                tempItem.addEventListener("click", (e) => {
                    e.preventDefault();
                    this.gotoPage(CONFIG.VARS.CURRENT_PAGE + 1);
                });
                tempItem.classList.add("prevent-select", "page");
                tempItem.innerText = "»";
                paginationItem_next.appendChild(tempItem);

                if (CONFIG.VARS.CURRENT_PAGE === CONFIG.VARS.TOTAL_PAGES) {
                    paginationItem_next.classList.add("disabledbutton");
                }
                paginationList.appendChild(paginationItem_next);
            }
        }

        // If there was an existing processing indicator, add it to the new pagination list
        if (existingProcessing) {
            paginationList.appendChild(existingProcessing);
        }

        CONFIG.DOM_ELEMENT.PAGINATION_CONTAINER.appendChild(paginationList);
    },

    /**
     * Navigates to a specific page and handles scroll behavior
     * @param {number} page - The target page number
     * @param {string} scrollTo - Where to scroll after page change ('top' or 'bottom')
     * @public
     */
    gotoPage(page, scrollTo = "top") {
        CONFIG.VARS.CURRENT_PAGE = isNaN(page)
            ? CONFIG.VARS.CURRENT_PAGE
            : Math.max(1, Math.min(page, CONFIG.VARS.TOTAL_PAGES));
        this.showCurrentPageContent();
        this.generatePagination();

        if (scrollTo === "top") {
            window.scrollTo({ top: 0, behavior: "instant" });
        } else if (scrollTo === "bottom") {
            window.scrollTo({
                top: document.body.scrollHeight,
                behavior: "instant",
            });
        }
        GetScrollPositions(true, true);
    },

    /**
     * Handles page number input field events (Enter key)
     * @param {Event} e - The keypress event object
     * @param {string} scrollTo - Where to scroll after page change ('top' or 'bottom')
     * @public
     */
    gotoPageInputField(e, scrollTo = "top") {
        if (e.key === "Enter") {
            let pageNumberInput = e.target.value;
            const page = parseInt(pageNumberInput);

            // Validate and set the current page within bounds
            CONFIG.VARS.CURRENT_PAGE = isNaN(page)
                ? CONFIG.VARS.CURRENT_PAGE
                : Math.max(1, Math.min(page, CONFIG.VARS.TOTAL_PAGES));

            // Update content and pagination
            this.showCurrentPageContent();
            this.generatePagination();

            // Handle scrolling based on the scrollTo parameter
            if (scrollTo === "top") {
                setTimeout(() => {
                    window.scrollTo({ top: 0, behavior: "instant" });
                }, 10);
            } else if (scrollTo === "bottom") {
                window.scrollTo({
                    top: document.body.scrollHeight,
                    behavior: "instant",
                });
            }

            // Get current scroll positions
            GetScrollPositions();
        }
    },

    /**
     * Navigates to a specific line number in the text
     * @param {number} lineNumber - The target line number to navigate to
     * @param {boolean} isTitle - Whether the line is a title (affects scroll behavior)
     * @returns {number} 0 if successful, -1 if failed
     * @public
     */
    gotoLine(lineNumber, isTitle = true) {
        // Find the page number to jump to
        // console.log(`lineNumber: ${lineNumber}, isTitle: ${isTitle}`);

        let needToGoPage = CONFIG.VARS.PAGE_BREAKS.findIndex((breakPoint) => breakPoint > lineNumber);
        needToGoPage = needToGoPage === -1 ? CONFIG.VARS.PAGE_BREAKS.length : needToGoPage;
        needToGoPage = Math.max(1, Math.min(needToGoPage, CONFIG.VARS.TOTAL_PAGES));
        // console.log("needToGoPage: ", needToGoPage);
        if (needToGoPage !== CONFIG.VARS.CURRENT_PAGE) {
            this.gotoPage(needToGoPage, false);
        }

        if (isTitle) {
            // Set the current title in the TOC as active
            setChapterTitleActive(lineNumber);

            CONFIG.VARS.GOTO_TITLE_CLICKED = true;
            // console.log("gotoTitle_Clicked: ", CONFIG.VARS.GOTO_TITLE_CLICKED);
        } else {
            // scroll to the particular line
            const line = CONFIG.DOM_ELEMENT.GET_LINE(lineNumber);
            try {
                // console.log("line.tagName: ", line.tagName);
                if (line && line.tagName === "H2") {
                    // Add the following line because we no longer use in-line onclick event
                    line.scrollIntoView({ behavior: "instant", block: "start" });
                    // scroll back 3.2em to show the title and margin
                    // line-height:1.6em;
                    // margin-top:1.6em;
                    const scrollBackPx = this.EM_IN_PX_CONTENT * 3;
                    // console.log("scrollBackPx: ", scrollBackPx);
                    window.scrollBy(0, -scrollBackPx);
                    setChapterTitleActive(lineNumber);
                } else if (line) {
                    line.scrollIntoView({ behavior: "instant", block: "start" });
                } else {
                    console.log(`Error: No element with id 'line${lineNumber}' found.`);
                    return -1;
                }
            } catch (error) {
                console.log(`Error: Unable to scroll to line line${lineNumber}.`);
                return -1;
            }
        }

        // Remember the line number in history
        setHistory(CONFIG.VARS.FILENAME, lineNumber);
        return 0;
    },

    /**
     * Returns an array of page numbers for pagination, with gaps represented by 0.
     * Credit: https://stackoverflow.com/questions/46382109/limit-the-number-of-visible-pages-in-pagination
     * @param {number} totalPages - Total number of pages.
     * @param {number} currentPage - Current page number.
     * @param {number} maxLength - Maximum length of the pagination array.
     * @returns {number[]} An array of page numbers with gaps represented by 0.
     * @throws {Error} If maxLength is less than 5.
     * @private
     */
    _getPageList(totalPages, currentPage, maxLength, duringProcessing = false) {
        if (maxLength < 5) {
            throw new Error("maxLength must be at least 5");
        }

        const range = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => i + start);

        const sideWidth = maxLength < 9 ? 1 : 2;
        const leftWidth = Math.floor((maxLength - sideWidth * 2 - 3) / 2);
        const rightWidth = Math.floor((maxLength - sideWidth * 2 - 2) / 2);

        // Handle different cases for generating the page list
        if (totalPages <= maxLength) {
            return range(1, totalPages);
        }

        if (currentPage <= maxLength - sideWidth - 1 - rightWidth) {
            const pageList = [
                ...range(1, maxLength - sideWidth - 1),
                0,
                ...range(totalPages - sideWidth + 1, totalPages),
            ];
            const pageList_duringProcessing = [...range(1, maxLength - sideWidth - 1), 0];
            return duringProcessing ? pageList_duringProcessing : pageList;
        }

        if (currentPage >= totalPages - sideWidth - 1 - rightWidth) {
            const pageList = [
                ...range(1, sideWidth),
                0,
                ...range(totalPages - sideWidth - 1 - rightWidth - leftWidth, totalPages),
            ];
            const pageList_duringProcessing = [...range(1, sideWidth), 0];
            return duringProcessing ? pageList_duringProcessing : pageList;
        }

        const pageList = [
            ...range(1, sideWidth),
            0,
            ...range(currentPage - leftWidth, currentPage + rightWidth),
            0,
            ...range(totalPages - sideWidth + 1, totalPages),
        ];
        const pageList_duringProcessing = [
            ...range(1, sideWidth),
            0,
            ...range(currentPage - leftWidth, currentPage + rightWidth),
            0,
        ];
        return duringProcessing ? pageList_duringProcessing : pageList;
    },

    /**
     * Handles TOC (Table of Contents) click events
     * Navigates to the clicked line and scrolls to its position
     * One handler for the entire TOC
     * @param {Event} e - The click event object
     * @private
     */
    _handleTOCClick(e) {
        const target = e.target;
        if (target.tagName === "A" && target.id.startsWith("a")) {
            e.preventDefault();
            const lineNum = parseInt(target.id.replace(/[^\d]/g, ""), 10);
            // console.log("Clicked TOC line number:", lineNum);

            if (!isNaN(lineNum)) {
                this.gotoLine(lineNum);

                const line = CONFIG.DOM_ELEMENT.GET_LINE(lineNum);
                const top = line.offsetTop;
                const style = line.currentStyle || window.getComputedStyle(line);
                const top_margin = parseFloat(style.marginTop);
                // console.log("top: ", top, "top_margin: ", top_margin);
                window.scrollTo(0, top - top_margin, { behavior: "instant" });
            }
        }
    },

    /**
     * Updates the column layout based on screen aspect ratio
     * @private
     */
    _updateColumnLayout() {
        const contentElement = CONFIG.DOM_ELEMENT.CONTENT_CONTAINER;
        const aspectRatio = window.innerWidth / window.innerHeight;
        console.log("aspectRatio: ", aspectRatio);

        if (aspectRatio > 22 / 9) {
            contentElement.className = "columns-2";
        } else {
            contentElement.className = "columns-1";
        }
    },
};

# rePub

[![build](https://github.com/hafacc/repub/actions/workflows/build.yml/badge.svg)](https://github.com/hafacc/repub/actions/workflows/build.yml)
[![chrome](https://img.shields.io/badge/chrome-extension-orange)](https://chrome.google.com/webstore/detail/repub/blkjpagbjaekkpojgcgdapmikoaolpbl)
[![license](https://img.shields.io/github/license/hafacc/repub)](LICENSE)

> ⚠️ **schema version 4 not supported**: reMarkable is updating their backend gradually with a new schema. If you experience this issue, you should switch your extension to download the epubs, and upload them using an official app. You can follow progress to fix the issue [here](https://github.com/hafacc/repub/issues/23)

A reMarkable ePub generator. This is essentially an open source version of
[Read on reMarkable](https://chrome.google.com/webstore/detail/read-on-remarkable/bfhkfdnddlhfippjbflipboognpdpoeh).
In contast to that extension, this will include images in the generated ePub
files. It also offers more configuration options over the original extension —
margins, text scale, line height, alignment, fonts, tags, and a cover page —
available from the extension's options page.

However this doesn't replicate the printer adapter, so if you want to upload
PDFs it still recommended to keep the Read on reMarkable extension for those
uploads.

## Firefox

Currently there's an unaffiliated [hard fork](https://github.com/jrockwar/repubfox) that may suit your needs. Full support is [planned](https://github.com/hafacc/repub/issues/14)

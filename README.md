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

It also registers itself as a printer, so anything you can print in Chrome can
be sent to your reMarkable as a PDF, from the print dialog. The printer only
shows up once the extension is connected to your account, and the paper sizes
it offers are the reMarkable screens, so pages arrive without extra borders.

## Firefox

Currently there's an unaffiliated [hard fork](https://github.com/jrockwar/repubfox) that may suit your needs. Full support is [planned](https://github.com/hafacc/repub/issues/14)

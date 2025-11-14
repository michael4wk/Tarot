14:10:03.288 Running build in Washington, D.C., USA (East) – iad1
14:10:03.289 Build machine configuration: 2 cores, 8 GB
14:10:03.450 Cloning github.com/michael4wk/Tarot (Branch: dev, Commit: 60c37d8)
14:10:09.636 Cloning completed: 6.186s
14:10:10.045 Restored build cache from previous deployment (2swXogKnLzUsV9yspStRz44WT9qF)
14:10:10.450 Running "vercel build"
14:10:10.847 Vercel CLI 48.9.2
14:10:11.486 Installing dependencies...
14:10:12.885 
14:10:12.886 > tarot2@1.0.0 prepare
14:10:12.886 > husky
14:10:12.886 
14:10:12.948 
14:10:12.949 up to date in 1s
14:10:12.949 
14:10:12.949 121 packages are looking for funding
14:10:12.949   run `npm fund` for details
14:10:12.982 Running "npm run build"
14:10:13.091 
14:10:13.091 > tarot2@1.0.0 build
14:10:13.092 > git lfs install || true && git lfs pull origin "$VERCEL_GIT_COMMIT_REF" --include="assets/images/**" || git lfs pull --include="assets/images/**" || true && vite build
14:10:13.092 
14:10:13.142 Hook already exists: pre-push
14:10:13.142 
14:10:13.142 	#!/usr/bin/env sh
14:10:13.143 	. "$(dirname "$0")/h"
14:10:13.143 
14:10:13.143 To resolve this, either:
14:10:13.143   1: run `git lfs update --manual` for instructions on how to merge hooks.
14:10:13.143   2: run `git lfs update --force` to overwrite your hook.
14:10:13.155 Invalid remote name "origin": invalid remote name: "/vercel/path0/origin"
14:10:13.186 batch request: missing protocol: ""
14:10:13.187 Failed to fetch some objects from ''
14:10:13.687 [36mvite v5.4.19 [32mbuilding for production...[36m[39m
14:10:13.785 transforming...
14:10:15.114 [32m✓[39m 127 modules transformed.
14:10:15.219 rendering chunks...
14:10:15.282 computing gzip size...
14:10:15.291 [2mdist/[22m[2massets/[22m[32mcard_back-9lBuApdp.svg                      [39m[1m[2m 0.13 kB[22m[1m[22m[2m │ gzip:  0.13 kB[22m
14:10:15.295 [2mdist/[22m[2massets/[22m[32mcard_logo-CeC_gHmR.png                      [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.296 [2mdist/[22m[2massets/[22m[32mmajor_arcana_chariot-BWbeYM79.png           [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.296 [2mdist/[22m[2massets/[22m[32mmajor_arcana_death-Dpz9W_x_.png             [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.296 [2mdist/[22m[2massets/[22m[32mmajor_arcana_devil-OmFOGQ29.png             [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.296 [2mdist/[22m[2massets/[22m[32mmajor_arcana_emperor-CcR1oeEd.png           [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.297 [2mdist/[22m[2massets/[22m[32mmajor_arcana_empress-n3rNNTGA.png           [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.297 [2mdist/[22m[2massets/[22m[32mmajor_arcana_fool-CXykpBRJ.png              [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.297 [2mdist/[22m[2massets/[22m[32mmajor_arcana_fortune-DxT3zu8Y.png           [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.297 [2mdist/[22m[2massets/[22m[32mmajor_arcana_hanged-DeqhR9QW.png            [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.298 [2mdist/[22m[2massets/[22m[32mmajor_arcana_hermit-9QbQ96xL.png            [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.298 [2mdist/[22m[2massets/[22m[32mmajor_arcana_hierophant-DW4U-LoV.png        [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.298 [2mdist/[22m[2massets/[22m[32mmajor_arcana_judgement-Bi7ht0cx.png         [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.298 [2mdist/[22m[2massets/[22m[32mmajor_arcana_justice-Dw4b9BFo.png           [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.298 [2mdist/[22m[2massets/[22m[32mmajor_arcana_lovers-9-nZVJh4.png            [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.299 [2mdist/[22m[2massets/[22m[32mmajor_arcana_magician-CMt1nSjl.png          [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.299 [2mdist/[22m[2massets/[22m[32mmajor_arcana_moon-BNEJ9arR.png              [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.299 [2mdist/[22m[2massets/[22m[32mmajor_arcana_priestess-C5tRwdkc.png         [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.299 [2mdist/[22m[2massets/[22m[32mmajor_arcana_star-BAs4w9r0.png              [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.300 [2mdist/[22m[2massets/[22m[32mmajor_arcana_strength-DyDYwVX0.png          [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.300 [2mdist/[22m[2massets/[22m[32mmajor_arcana_sun-BSJ5XS28.png               [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.300 [2mdist/[22m[2massets/[22m[32mmajor_arcana_temperance-BFVTwzu_.png        [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.300 [2mdist/[22m[2massets/[22m[32mmajor_arcana_tower-ByaBcqQF.png             [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.300 [2mdist/[22m[2massets/[22m[32mmajor_arcana_world-BSGRTXG8.png             [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.301 [2mdist/[22m[2massets/[22m[32mminor_arcana_cups_10-BsU06Cdk.png           [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.301 [2mdist/[22m[2massets/[22m[32mminor_arcana_cups_2-0nX6HnPa.png            [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.302 [2mdist/[22m[2massets/[22m[32mminor_arcana_cups_3-DFCHxTfU.png            [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.302 [2mdist/[22m[2massets/[22m[32mminor_arcana_cups_4-N1dM5Fx3.png            [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.302 [2mdist/[22m[2massets/[22m[32mminor_arcana_cups_5-DkOy-DqY.png            [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.302 [2mdist/[22m[2massets/[22m[32mminor_arcana_cups_6-Chb69urj.png            [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.303 [2mdist/[22m[2massets/[22m[32mminor_arcana_cups_7-dbMSxCoP.png            [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.303 [2mdist/[22m[2massets/[22m[32mminor_arcana_cups_8-608Ueb55.png            [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.303 [2mdist/[22m[2massets/[22m[32mminor_arcana_cups_9-DJ6BoAWl.png            [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.303 [2mdist/[22m[2massets/[22m[32mminor_arcana_cups_ace--kNtZY7j.png          [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.304 [2mdist/[22m[2massets/[22m[32mminor_arcana_cups_king-CPqvcEyl.png         [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.304 [2mdist/[22m[2massets/[22m[32mminor_arcana_cups_knight-DXRF3Axi.png       [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.304 [2mdist/[22m[2massets/[22m[32mminor_arcana_cups_page-BUttGmqn.png         [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.304 [2mdist/[22m[2massets/[22m[32mminor_arcana_cups_queen-4aHcFHB8.png        [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.304 [2mdist/[22m[2massets/[22m[32mminor_arcana_pentacles_10-BQ4GeliG.png      [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.305 [2mdist/[22m[2massets/[22m[32mminor_arcana_pentacles_2-CjW-YsbB.png       [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.305 [2mdist/[22m[2massets/[22m[32mminor_arcana_pentacles_3-D68GVLL1.png       [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.305 [2mdist/[22m[2massets/[22m[32mminor_arcana_pentacles_4-BcGNO826.png       [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.305 [2mdist/[22m[2massets/[22m[32mminor_arcana_pentacles_5-DWislYaW.png       [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.305 [2mdist/[22m[2massets/[22m[32mminor_arcana_pentacles_9-BrUSRoJ7.png       [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.306 [2mdist/[22m[2massets/[22m[32mminor_arcana_pentacles_8-C9EylXr4.png       [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.306 [2mdist/[22m[2massets/[22m[32mminor_arcana_pentacles_ace-DTTcPYXY.png     [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.306 [2mdist/[22m[2massets/[22m[32mminor_arcana_pentacles_king-CKG58OYW.png    [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.306 [2mdist/[22m[2massets/[22m[32mminor_arcana_pentacles_knight-BUcMB62m.png  [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.306 [2mdist/[22m[2massets/[22m[32mminor_arcana_pentacles_page-BMN2fCSJ.png    [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.306 [2mdist/[22m[2massets/[22m[32mminor_arcana_pentacles_queen-DzHx3WrR.png   [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.307 [2mdist/[22m[2massets/[22m[32mminor_arcana_swords_10-DcrTOaS7.png         [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.307 [2mdist/[22m[2massets/[22m[32mminor_arcana_swords_2-BkdZwfKp.png          [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.307 [2mdist/[22m[2massets/[22m[32mminor_arcana_swords_3-D_YnEyQk.png          [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.307 [2mdist/[22m[2massets/[22m[32mminor_arcana_swords_4-CjJ-MFsa.png          [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.307 [2mdist/[22m[2massets/[22m[32mminor_arcana_swords_5-Buf7S31-.png          [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.307 [2mdist/[22m[2massets/[22m[32mminor_arcana_swords_6-RvITtJn-.png          [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.308 [2mdist/[22m[2massets/[22m[32mminor_arcana_swords_7-BM4lRCJR.png          [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.308 [2mdist/[22m[2massets/[22m[32mminor_arcana_swords_8-CmqZsi55.png          [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.308 [2mdist/[22m[2massets/[22m[32mminor_arcana_swords_9-BmP2vSX3.png          [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.308 [2mdist/[22m[2massets/[22m[32mminor_arcana_swords_ace-BrqFpAEN.png        [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.308 [2mdist/[22m[2massets/[22m[32mminor_arcana_swords_king-BFGakzqZ.png       [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.308 [2mdist/[22m[2massets/[22m[32mminor_arcana_swords_knight-DmTL-a0n.png     [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.309 [2mdist/[22m[2massets/[22m[32mminor_arcana_swords_page-CCvS98Jg.png       [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.309 [2mdist/[22m[2massets/[22m[32mminor_arcana_swords_queen-Bo8zKvg2.png      [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.309 [2mdist/[22m[2massets/[22m[32mminor_arcana_wands_10-NV3dp4RQ.png          [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.309 [2mdist/[22m[2massets/[22m[32mminor_arcana_wands_2-CkGIcHNA.png           [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.309 [2mdist/[22m[2massets/[22m[32mminor_arcana_wands_3-Bkt5XRpo.png           [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.310 [2mdist/[22m[2massets/[22m[32mminor_arcana_wands_4-BM2oCgM9.png           [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.310 [2mdist/[22m[2massets/[22m[32mminor_arcana_wands_5-0-luS3RU.png           [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.310 [2mdist/[22m[2massets/[22m[32mminor_arcana_wands_6-BAWXzNCt.png           [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.310 [2mdist/[22m[2massets/[22m[32mminor_arcana_wands_7-HhZemMt0.png           [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.310 [2mdist/[22m[2massets/[22m[32mminor_arcana_wands_8-DukyRooe.png           [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.310 [2mdist/[22m[2massets/[22m[32mminor_arcana_wands_9-CAQ4DnHa.png           [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.311 [2mdist/[22m[2massets/[22m[32mminor_arcana_wands_ace-D8Z3db8s.png         [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.311 [2mdist/[22m[2massets/[22m[32mminor_arcana_wands_king-DrANB3Vp.png        [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.311 [2mdist/[22m[2massets/[22m[32mminor_arcana_wands_knight-CWnDYzuo.png      [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.311 [2mdist/[22m[2massets/[22m[32mminor_arcana_wands_page-DTKYzB0f.png        [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.311 [2mdist/[22m[2massets/[22m[32mminor_arcana_wands_queen-BWsNcxlB.png       [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.311 [2mdist/[22m[2massets/[22m[32mminor_arcana_pentacles_6-DkVLwOt-.png       [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.312 [2mdist/[22m[2massets/[22m[32mminor_arcana_pentacles_7-Cr-cEfjl.png       [39m[1m[2m 0.13 kB[22m[1m[22m
14:10:15.312 [2mdist/[22m[32mindex.html                                         [39m[1m[2m 0.40 kB[22m[1m[22m[2m │ gzip:  0.27 kB[22m
14:10:15.312 [2mdist/[22m[2massets/[22m[35mindex-BFvald2K.css                          [39m[1m[2m 1.79 kB[22m[1m[22m[2m │ gzip:  0.84 kB[22m
14:10:15.312 [2mdist/[22m[2massets/[22m[35mResultPage-Fpkeo6VW.css                     [39m[1m[2m 3.79 kB[22m[1m[22m[2m │ gzip:  1.14 kB[22m
14:10:15.312 [2mdist/[22m[2massets/[22m[35mDrawPage-DS1UQ4iE.css                       [39m[1m[2m 3.80 kB[22m[1m[22m[2m │ gzip:  1.29 kB[22m
14:10:15.313 [2mdist/[22m[2massets/[22m[36mResultPage-CX7newbT.js                      [39m[1m[2m 6.29 kB[22m[1m[22m[2m │ gzip:  3.23 kB[22m
14:10:15.313 [2mdist/[22m[2massets/[22m[36mDrawPage-Dmp1U6O8.js                        [39m[1m[2m 9.61 kB[22m[1m[22m[2m │ gzip:  4.16 kB[22m
14:10:15.313 [2mdist/[22m[2massets/[22m[36mtarotService-CqfrjUiw.js                    [39m[1m[2m28.36 kB[22m[1m[22m[2m │ gzip: 10.38 kB[22m
14:10:15.318 [2mdist/[22m[2massets/[22m[36mindex-Bq2KQfSU.js                           [39m[1m[2m88.41 kB[22m[1m[22m[2m │ gzip: 35.13 kB[22m
14:10:15.318 [32m✓ built in 1.58s[39m
14:10:15.472 Build Completed in /vercel/output [4s]
14:10:15.598 Deploying outputs...
14:10:18.188 Deployment completed
14:10:18.786 Creating build cache...
14:10:26.465 Created build cache: 7.679s
14:10:26.474 Uploading build cache [29.23 MB]
14:10:26.920 Build cache uploaded: 453.411ms
# Handwriting recognition model

`PP-OCRv6_rec_small.onnx` is the PaddleOCR PP-OCRv6 small text-recognition
model, as converted to ONNX and distributed by the RapidOCR project
(RapidAI/RapidOCR, release 3.9.2). Both projects are licensed under the
Apache License, Version 2.0.

It is kept in the repository rather than downloaded at start-up so that a
deploy is self-contained: the free hosting plan restarts the server after
every idle spell, and fetching 20 MB from an overseas model host on each
restart would make the first scan of the day slow or fail outright.

Only the recogniser is used. Finding the table on the page is done with the
register's own ruled lines, in `app/core/register_reader.py`.

# Experimental on-device handwriting reader

This is an application integration, not a newly trained foundation model.

## Bengali specialist (experimental review-only beta, 2026-09-24)

- BhaashaHWOCR: https://github.com/NLTM-OCR/BhaashaHWOCR at revision
  `0932e75053ad3b6b433840710d03b15e3000a7b1`. Repository code is MIT,
  copyright 2023 IIIT-Hyderabad; the original LICENSE is copied alongside the model.
- Bengali weights: https://github.com/NLTM-OCR/BhaashaHWOCR/releases/tag/V2,
  `bengali.zip`, SHA-256
  `24c9187929d5ee0ff0e4f9e9a2393e2987209800ed32177fe2f8bb17db06797f`.
  The repository README points users to its release assets for pretrained models,
  and no separate restriction appears in the pinned README, MIT license or V2
  release notes. This beta includes the model with the repository attribution;
  retain this notice when copying it. This is a conservative attribution record,
  not legal advice.
- The archive lexicon has 223 symbols but the recognizer has 92 output classes.
  The pinned repository alphabet (91 symbols plus CTC blank) is used only for
  evaluation. It does not support slash date separators. No date repair is applied.
- CPU evaluation uses an isolated Python environment, reviewed model modules and
  `torch.load(weights_only=True)`. The upstream inference script, CUDA/layout
  pipeline and its filesystem cleanup commands are not executed.
- Local fixed-shape ONNX export: 70,939,762 bytes. Its generated manifest records
  the SHA-256 checked by the browser before inference. All runtime/model files
  are served from the same origin. No document is sent to this project's authors.
- Browser runtime pinned to `onnxruntime-web@1.31.0-dev.20260914-8d85527a0`
  (MIT). CPU WebAssembly runs in a cancellable dedicated worker, without WebGPU.
- Deterministic centered padding replaces upstream random padding for evaluation.
  No customer examples were used for model training in this work.
- Accuracy is not accepted for unattended use: the checker marks every
  specialist row unverified, shows source crops/raw text and requires correction
  and confirmation before comparison or saving. Bus digits and journey dates
  remain known weak cases.

## Other experimental dependencies

- Qwen3-VL-2B-Instruct: https://huggingface.co/Qwen/Qwen3-VL-2B-Instruct — Apache-2.0. The model setup script distributes the upstream LICENSE with the weights.
- ONNX conversion: https://huggingface.co/onnx-community/Qwen3-VL-2B-Instruct-ONNX at revision 3e4136ea66ae6e07c110e64fe07da2e029517ab5. Quantized weights can reduce recognition accuracy.
- Transformers.js 4.3.0: https://github.com/huggingface/transformers.js — Apache-2.0. See node_modules/@huggingface/transformers/LICENSE.
- ONNX Runtime: https://github.com/microsoft/onnxruntime — MIT (below).

MIT License

Copyright (c) Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

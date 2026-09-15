+++
title = "Simulating a Black Hole on an iPhone"
date = 2026-07-11T09:00:00
draft = true
description = ""
[extra]
header_image = "header.webp"
header_text = "light"
header_position = "50% 50%"
header_image_alt = ""
[taxonomies]
tags = ["Programming"]
+++

When Double Negative VFX and Kip Thorne developed their black hole renderer for the film Interstellar, performance was only a concern if individual frames took more than a few days to render on one of their 3,200 10-core CPUs. Fortunately, there are other approaches. 

A 2012 paper by Thomas Müller and Jörg Frauendiener takes a different appproach. Müller and Frauendiener sacrifice some realism and uses creative math to reduce the computation time significantly. Specifically, they model a nonspinning black hole, unlike the one in Interstellar which is very much spinning.

{{ <body_image page path="muller_frauendiener_fig4.webp" alt="A gray distorted disk on a black background with a glowing white spot on the inner left part of the disk." caption="An image produced by Thomas Müller and Jörg Frauendiener in 2012." height="80svh" /> }}

In 2012, Müller and Frauendiener wrote that their code could run at 400 FPS (2.5ms per frame) at a resolution of 1,000 x 1,000 on a GTX 480. That was exiciting to read because I knew if it could do that in 2012 it could run on an iPhone today.

# Research
Unfortunately, Müller and Frauendiener’s source code seemed to be lost to time on the University of Stuttgart website. I was persistent, though and I compared the broken download link for this project’s source to other working download links from the website. Miraculously, I guessed the correct URL for the file. I probably would have stopped this project if I wasn’t able to see their source code to understand how they implemented some of the math I was unfamiliar with like Jacobi elliptic functions.

# Metal
I wanted to learn C++ and Apple has been pushing metal-cpp for a while now so I went with that. It would have been simper to use Swift for everything, but I learned a lot about ARC and MRR from using metal-cpp, and I get the placebo that it’s faster because it’s written in C++.

The graphics programming part of this project is actually very simple, which is great for a first-timer! Much of the complexity of graphics programming comes from coaxing the CPU and GPU into communicating with each other, but in this case the handoff is clear and simple: the CPU says “please draw the black hole” and the GPU replies, “okay here is the image of the black hole, you can display it now.” Compared to a game engine that has to track dozens or hundreds of entities, and exactly what the GPU needs to do to render all of them, this is pretty simple.

```C++
// Please draw the black hole!
pComputeEncoder->setComputePipelineState(_pLensingPipeline.get());
pComputeEncoder->setBuffer(_pAppRenderStateBuffers[frameIndex].get(), 0, 0);
pComputeEncoder->setTexture(_pSceneTexture[frameIndex].get(), 0);
pComputeEncoder->setTexture(_pTemperatureTexture.get(), 1);
pComputeEncoder->setTexture(_pNoiseTexture.get(), 2);
pComputeEncoder->setTexture(_pSkyTexture.get(), 3);
pComputeEncoder->dispatchThreads(
    MTL::Size(_pSceneTexture[frameIndex]->width(), _pSceneTexture[frameIndex]->height(), 1),
    MTL::Size(16, 16, 1));
```

Then, to wait for the GPUs response, I use a MTLSharedEvent:

```C++
// Wait for the GPU to say, “Okay, I drew the black hole!”
++_pacingTimeStampIndex;
int frameIndex = _pacingTimeStampIndex % kMaxFramesInFlight;
// Render the first frames as fast as possible, then use the MTLSharedEvent
// to ensure we don't get out of sync with the GPU.
if (_pacingTimeStampIndex > kMaxFramesInFlight) {
    uint64_t const timeStampToWait = _pacingTimeStampIndex - kMaxFramesInFlight;
    _pPacingEvent->waitUntilSignaledValue(timeStampToWait, DISPATCH_TIME_FOREVER);
}
```

# Shaders
The real complexity comes in the shader itself, the “lensing pipeline.”  I went a little crazy with the abstraction so the shader program itself looks like this:
```c++
constant const ViewportRenderState& viewport = state.viewport;
constant const CameraRenderState& camera = state.camera;
constant const AccretionDiskRenderState& disk = state.accretionDisk;
const float schwarzschildRadius = state.blackHole.schwarzschildRadius; // r_s

Ray ray = makeRay(position, viewport, camera);
TraceResult result = traceRay(ray, schwarzschildRadius, disk);
float3 color = shadeResult(result, ray.direction, state, temperature, noise, sky);

output.write(float4(color, 1.f), position);
```
So what in the world is a constant const? In Metal, constant is the keyword used to denote the address space, when something is in constant address space every GPU core can access it with the gauruntee that nobody else is modifying it, which makes it fast. The const keyword comes from C++ and enforces that I can’t modify that reference in my code. Also, if you’re worrying about inlining, don’t.

Beyond this deceptively simple structure, things do get annoyingly complicated 

{{ <body_image page path="Progress_Feb_9_2026.png" alt="Black hole renderer progress from February 9, 2026" caption="Renderer progress on February 9, 2026." height="80svh" /> }}


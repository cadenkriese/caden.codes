+++
title = "Simulating a Black Hole on an iPhone"
date = 2026-09-16T18:00:00
draft = false
description = "Visualizing general relativity using Metal, C++ and Swift."
[extra]
header_image = "header.webp"
header_text = "light"
header_position = "50% 50%"
header_image_alt = ""
[taxonomies]
tags = ["Programming"]
+++

When Double Negative VFX (DNEG) and Kip Thorne developed thei black hole renderer for the film Interstellar, performance was only a concern if individual frames took more than a few days to render on one of their 3,200 10-core CPUs. This is because their simulation was incredibly physically accurate in its depiction of the black hole and the camera optics that receive the altered light. Plus, they needed to render ~8K resolution frames for IMAX quality. 

DNEG's renderer uses a numerical methods approach to calculate the bending of light, similar to Euler’s method. For each of the 23 million pixels in an IMAX frame, they take tiny steps and then calculate what the light’s new direction is and then take another tiny step and repeat it hundreds or thousands of times, which is why it can take several hours to render a frame. 

Thomas Müller and Jörg Frauendiener took a different approach. Müller and Frauendiener sacrifice some realism and use creative math to reduce the computation time significantly. Specifically, they model a nonspinning black hole, unlike the one in Interstellar which is very much spinning. That choice simplifies things a lot because non-spinning blackholes are spherically symmetric.

<div class="figure-pair">

{{ <body_image page path="kerr.png" alt="An oblong black hole surrounded by a heavily distorted sky." caption="A spinning black hole rendered in SpaceEngine. Notice its oblong shape." /> }}

{{ <body_image page path="schwarzschild.png" alt="A spherical black hole surrounded by a distorted sky." caption="A nonspinning black hole rendered in my app, Gravitation." /> }}

</div>

The creative math in Müller and Frauendiener’s paper comes from capitalizing on this symmetry by confining each ray of light to a plane, and then finding the line where that plane intersects the accretion disk, the ring of swirling hot gas around a black hole that gives it its characteristic glowing look.

Confining each ray of light to a plane turns the 3D problem into a 2D one. They ask: Where does the curve of light intersect the line that represents the accretion disk? And solve it using elliptic functions.

In 2012, Müller and Frauendiener wrote that their code could run at 400 FPS (2.5ms per frame) at a resolution of 1,000 x 1,000 on a GTX 480. That was exiciting to read because I knew if it could do that in 2012 it could run on an iPhone today.

Unfortunately, Müller and Frauendiener’s source code seemed to be lost to time on the University of Stuttgart website. I was persistent, though and I compared the broken download link for this project’s source to other working download links from the website. Miraculously, I guessed the correct URL and downloaded their source code. It helped tremendously to see how they implement the Jacobi elliptic functions with complex variables.

Ultimately, though, my implementation of those functions ended up very different. I heavily relied on the NIST Digital Library of Mathematical Functions, especially Chapter 22, to implement my version.

## Metal
I wanted to learn C++ and Apple has been pushing metal-cpp for a while now so I went with that. It would have been simper to use Swift for everything, but I learned a lot about ARC and MRR from using metal-cpp, and I get the placebo that it’s faster because it’s written in C++.

The graphics programming part of this project is actually very simple, which is great for a first-timer! Much of the complexity of graphics programming comes from coaxing the CPU and GPU into communicating with each other, but in this case the handoff is clear and simple: the CPU says “please draw the black hole” and the GPU replies, “okay here is the image of the black hole.” That’s about it. Compared to a game engine that has to track dozens or hundreds of entities, and exactly what the GPU needs to do to render all of them, this is pretty simple.

```C++
// Please draw the black hole!
pComputeEncoder->setComputePipelineState(_pLensingPipeline.get());
// Set buffers and textures
pComputeEncoder->dispatchThreads(
    MTL::Size(width, height, 1),
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

## Shaders
The real complexity comes in the shader itself, the “lensing pipeline.”  That pipeline has three distinct phases: geometry setup, lensing calculation and color calculation. My code is abstracted to match those phases, as seen here:
```C++
Ray ray = makeRay(position, viewport, camera);
TraceResult result = traceRay(ray, schwarzschildRadius, disk);
float3 color = shadeResult(result, ray.direction, state, temperature, noise, sky);

output.write(float4(color, 1.f), position);
```
So, what does each section really do? I already touched on the geometry setup step, `makeRay`; it calculates the line of intersection between the plane of the accretion disk and the plane of the light ray.

Most ray tracers work backwards, tracing light from the destination to the source. Mine is no exception. This is convenient because if you started from the source you would have no gauruntee that the light would reach the camera, but if you start from the camera, you can find which source it came from (or didn’t come from because it’s a black hole after all) and then decide what color it should be.

The traceRay function walks through Müller and Frauendiener’s method, working backwards with rays coming from the camera. However, my implementation differs in a few key ways. First, their code only checks if the light intersects the disk immediately, which isn’t fully correct. In this extreme gravitational environment, light can wrap around the black hole one or more times before hitting the disk after one or more orbit, so my code checks for intersections in the first orbit and a half. After that, there isn’t much difference. 

You can see the difference between our two versions. Mine has the very thin line along the horizon extend below the black hole as well, this represents light that 

{{ <body_image page path="muller_frauendiener_figure.png" alt="A wide gray outer ring on a black background that bends over a black hole and a narrow inner semi-circle-like curve that outlines the top of the black hole." caption="Müller and Frauendiener's render." height="40svh" /> }}

{{ <body_image page path="higher_order_image_comparison.png" alt="A yellow-orange gas ring and an inner ring that fully curve around the black hole." caption="My render. Notice how the narrow inner ring forms a full circle in my version." height="40svh" /> }}

You can also see that mine renders a sky in the background. I extended Müller and Frauendiener’s system to not just check for if the light hits a disk but also find it’s total deflection is before it escapes to infinity using elliptic integrals. That could be a post of its own, so for now, we will move on.

## Colors
Accretion disks are hot. Fried-by-gamma-rays-if-you’re-in-the-same-solar-system-hot. My depiction of an accretion disk is where this project shifts from pure realism to a blend of realism and artistic interpretation. It is slightly less realistic but dramatically more artistic to imagine an accretion disk not as blazing hot as most really are but as a “cool” 2,000–3,000 ºK. This is the same kind of ‘anemic’ accretion disk seen in Interstellar. 

Originally, I followed Kip Thorne’s equation for a quartic curve describing the flux along the radius of the accretion disk but I thought it looked too uniform so I went artistic there too and used a random formula I thought looked nice. For the colors themselves, I use the technique described by Dan Bruton to simulate what colors our eyes see from a black-body radiating at a given temperature. 

However, I got inspired by interstellar to try to simulate what a Kodak film camera would see, instead of our eyes, which is the look I settled on. To do that, I had to hand-trace Kodak’s published spectral sensitivity curves for an old film stock, the EXR 50D Film / 5245. Here is a comparison between what the human eye sees and the Kodak film:

{{ <body_image page path="CIE_LUT.png" alt="A color gradient starting with a deep red that gradually becomes a white and then a blue." caption="The colors our eyes would see from something glowing hot. 1,000–10,000 ºK left to right."/> }}

{{ <body_image page path="Kodak_LUT.png" alt="A color gradient starting with a lighter orange that slowly becomes a white and then an incredibly pale blue." caption="The colors that would show up on Kodak EXR 50D Film / 5245. 1,000–10,000 ºK left to right." /> }}

As an aside, the texture of the accretion disk, like everything that looks cool in computer graphics, is just layered noise textures. You can see it start to stretch as the image we see begins to bend over the top of the horizon:

{{ <body_image page path="noise_texture_stretching.webp" alt="Close-up of layered noise stretching across the glowing accretion disk as its image bends around the black hole." /> }}

## Bloom
Bloom makes the accretion disk look like it’s glowing. In a camera this happens because of imperfections in the lenses allowing light to bounce around (instead of just bending), the light bounces and spreads out creating a charactaristic glare, veil or lens flare. This can be computed analytically by tracing light paths in simulated camera optics, but I didn’t go that far, yet. Maybe in the future!

For now, I relied on a pretty standard bloom algorithm by Jorge Jiminez that he made while working at Activision.

## Xcode’s Metal Debugger
The Xcode engineers really outdid themselves with the Metal debugger. It’s truly phenomenal. I used it to debug countless floating point errors, performance regressions and to just generally understand the bottlenecks of my code.

{% <carousel label="Xcode Metal debugger screenshots"> %}
<li>
{{ <body_image page path="xcode_debugger_shader_profiling.webp" alt="Xcode’s Metal shader profiler showing instruction costs alongside the rendered black hole." /> }}
</li>
<li>
{{ <body_image page path="xcode_debugger_shader_timeline.webp" alt="Xcode’s GPU timeline showing calculateLensing taking 2.31 milliseconds, followed by bloom and tone mapping." /> }}
</li>
{% </carousel> %}

In the second photo you can see that the `calculateLensing` phase of the shader took 2.31ms while the window was at a resolution of 3110x1952, which I think is pretty fast!

## What’s next?
I will release Gravitation on the app store soon! After that, for a Mac version I will add an option to export videos so people can make their own physically accurate animated wallpapers or footage to use for whatever. I might also explore more integration with the SwiftUI animation system to power keyframes or camera paths. There is plenty more that can be done to improve the physical accuracy, a higher resolution background, star rendering, motion blur, the doppler effect, etc. They’re all very exciting prospects, but I’m not sure which ones I will decide to implement. Only time will tell!

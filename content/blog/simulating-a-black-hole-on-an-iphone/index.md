+++
title = "Simulating a Black Hole on an iPhone"
date = 2026-09-23T18:00:00
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

When Double Negative VFX (DNEG) and Kip Thorne developed the black hole renderer for the film *Interstellar*, performance was only a concern if individual frames took more than a few days to render on one of their 3,200 10-core CPUs. Their code was incredibly physically accurate in how it simulated the black hole and the camera optics that receive the distorted light. They also needed to render at ~8K resolution for IMAX quality, hence the long frame render times. 

DNEG and Thorne use numerical methods, similar to Euler's method, to calculate the bending of light. For each of the 23 million pixels in an IMAX frame, they take one tiny step in the direction of the light, calculate the new direction of the light, and then take another tiny step. They do this hundreds or thousands of times for each pixel, which is why it can take several hours to render a frame.[^james]

Thomas Müller and Jörg Frauendiener took a different approach in their 2012 paper, *Interactive visualization of a thin disc around a Schwarzschild black hole*.[^muller] Müller and Frauendiener sacrifice some realism and use creative math to reduce the computation time significantly. Specifically, they model a nonspinning black hole, unlike the one in *Interstellar*, which is very much spinning. That choice simplifies the math because non-spinning blackholes are spherically symmetric.

<div class="figure-pair">
{{ <body_image page path="kerr.png" alt="An oblong black hole surrounded by a heavily distorted sky." caption="A spinning black hole. Notice its elongated shape. (Image: SpaceEngine)" /> }}

{{ <body_image page path="schwarzschild.png" alt="A spherical black hole surrounded by a distorted sky." caption="A nonspinning black hole. Rendered in my app, Gravitation." /> }}
</div>

The creative math in Müller and Frauendiener’s paper is how they use this symmetry to confine each ray of light into a plane. They then find the line of intersection between that plane and the *accretion disk*, the ring of swirling hot gas around a black hole that gives it its characteristic glowing look.

Confining each ray of light in a plane turns the 3D problem into a 2D one. They ask: Where does the path of the light intersect the line that represents the accretion disk? And solve it using elliptic functions.

In 2012, Müller and Frauendiener wrote that their code could run at 400 FPS (2.5ms per frame) at a resolution of 1,000 x 1,000 on a GTX 480. If it could run that well on 2012 hardware, I knew it could run on an iPhone today.

## Metal
To implement Müller and Frauendieners method on iPhone, I chose to use Metal and C++ with a SwiftUI frontend because I wanted everything to feel native and run fast. For Metal, most of the work came from memory management, synchronizing with the display and keeping track of three copies of the render state (triple-buffering). 

Memory management required special attention throughout the renderer because metal-cpp uses manual retain and release for its types, whereas in Swift and Objective-C they are handled by automatic reference counting. I had to be mindful of that whenever data needed to cross between languages, which led me to manage render state in a dedicated type that is shared across C++, Objective-C++, Swift and Metal, ensuring they are on the same page. 

The rendering pipeline itself was more straightforward. Much of the complexity of graphics programming comes from coaxing the CPU and GPU into communicating with each other, but for my renderer the handoff is clear and simple: the CPU says, “Please draw the black hole.” and the GPU replies, “Okay, here is the image of the black hole.” That’s about it. The code below is written in C++ using metal-cpp.

```C++
// Please draw the black hole!
pComputeEncoder->setComputePipelineState(_pLensingPipeline.get());
// Set buffers and textures
pComputeEncoder->dispatchThreads(
    MTL::Size(width, height, 1),
    MTL::Size(16, 16, 1));
```

```C++
// If we are more than 3 frames ahead of the GPU, wait for it.
if (_pacingTimeStampIndex > 3) {
    uint64_t const timeStampToWait = _pacingTimeStampIndex - 3;
    _pPacingEvent->waitUntilSignaledValue(timeStampToWait, DISPATCH_TIME_FOREVER);
}
```

## Shaders
When the GPU executes the lensing pipeline, it runs my compute shader. My compute shader takes the pixel coordinates, window size, black hole paramaters and camera position as input, and outputs a color. I organized the shader into three parts: geometry setup, lensing calculation and color calculation.
```C++
Ray ray = makeRay(position, viewport, camera);
TraceResult result = traceRay(ray, schwarzschildRadius, disk);
float3 color = shadeResult(result, ray.direction, state, temperature, noise, sky);

output.write(float4(color, 1.f), position);
```
So, what does each section really do? I already touched on the geometry setup step, `makeRay`; it calculates the line of intersection between the plane of the accretion disk and the plane of the light ray.

To trace the ray, I start from the camera and then find the light source (or black hole in which case I shade the pixel black). Most ray tracers work backwards because it ensures each light ray reaches the camera. If you started from the light sources you would have no gauruntee that the light would reach the camera, but if you start from the camera, you can find which source it came from and then decide what color it should be.

The `traceRay` function walks through Müller and Frauendiener’s method, working backwards with rays coming from the camera. However, my implementation differs in a few key ways. First, their code only checks if the light intersects the disk immediately, which isn’t fully correct. In this extreme gravitational environment, light can wrap around the black hole one or more times before hitting the disk after one or more orbit, so my code checks for intersections in the first orbit and a half. After that, there isn’t much difference. 

You can see the difference between our two versions. Mine has the very thin line along the horizon extend below the black hole as well. That very thin line is a tertiary or higher order image, meaning the light has wrapped around the black hole multiple times.

{{ <body_image page path="muller_frauendiener_figure.png" alt="A wide gray outer ring on a black background that bends over a black hole and a narrow inner semi-circle-like curve that outlines the top of the black hole." caption="Müller and Frauendiener's render." height="40svh" /> }}

{{ <body_image page path="higher_order_image_comparison.png" alt="A yellow-orange gas ring and an inner ring that fully curve around the black hole." caption="My render. Notice how the narrow inner ring forms a full circle in my version." height="40svh" /> }}

You can also see that mine renders a sky in the background.[^dneg-backgrounds] I extended Müller and Frauendiener’s system to not just check for if the light hits a disk but also find it’s total deflection is before it escapes to infinity using elliptic integrals. That could be a post of its own, so for now, we will move on.

## Colors
Accretion disks are hot. Fried-by-gamma-rays-if-you’re-in-the-same-solar-system-hot. My depiction of an accretion disk is where this project shifts from pure realism to a blend of realism and artistic interpretation. In my opinion, it is slightly less realistic but significantly more artistic to imagine an accretion disk not as blazing hot but at a “cool” 2,000–3,000 ºK where they have a nice warm glow. This is the same kind of ‘anemic’ accretion disk seen in *Interstellar*.  Originally, I followed Kip Thorne’s equation describing the flux along the radius of the accretion disk but I thought it looked too uniform so I went artistic there too and made up a formula I thought looked nice. 

So how did I go from temperature to a RBG color value? First, I used the technique described by Dan Bruton to simulate what colors our eyes see from something radiating at a given temperature.[^bruton] Bruton uses Planck's law to find the wavelength of light radiated from a perfect black body at a given temperature, which is an useful approximation the color something is when it is glowing hot. It's just an approximation though, since nothing is a perfect black body. Then he convolves that with the International Comission on Illumination (CIE)'s 1931 color matching functions, which describe how humans perceive a certain wavelength of light. 

However, I got inspired by *Interstellar*, so instead of using the CIE colors to simulate the colors that humans would see, I hand traced curves from Kodak to simulate to try to simulate what colors a camera with Kodak film would see. The specific spectral sensitivity curves are for the EXR 50D Film / 5245.[^kodak]

Here is a comparison between what the human eye sees and the Kodak film:

{{ <body_image page path="CIE_LUT.png" alt="A color gradient starting with a deep red that gradually becomes a white and then a blue." caption="The colors our eyes would see from something glowing hot. 1,000–10,000 ºK left to right."/> }}

{{ <body_image page path="Kodak_LUT.png" alt="A color gradient starting with a lighter orange that slowly becomes a white and then an incredibly pale blue." caption="The colors that would show up on Kodak EXR 50D Film / 5245. 1,000–10,000 ºK left to right." /> }}

As an aside, the texture of the accretion disk, like everything that looks cool in computer graphics, is just layered noise textures. You can see it start to stretch as the image we see begins to bend over the top of the horizon.

{{ <body_image page path="noise_texture_stretching.webp" alt="Close-up of layered noise stretching across the glowing accretion disk as its image bends around the black hole." prominent={true} /> }}

## Bloom
Bloom makes the accretion disk look like it’s glowing. In a camera this happens because of imperfections in the lenses allowing light to bounce around and spread out throughout the lens, creating a charactaristic glare, veil or lens flare. This can be computed analytically by tracing light paths in simulated camera optics, but I didn’t go that far, yet. Maybe in the future!

For now, I relied on a pretty standard bloom algorithm by Jorge Jimenez that he made while working at Activision.[^jimenez] It fakes the look of bloom by making a bunch of lower resolution copies of the image and then adding them back on top of the initial image, which has the effect of slightly blurring it. 

## Performance
I *love* the Metal debugger in Xcode. It is phenomenal. I used it to debug countless floating point errors, performance regressions and to just generally understand the bottlenecks of my code. I was so impressed when I first captured a frame and saw a line-by-line performance breakdown of my shader, as seen in the first image below.

{% <carousel label="Xcode Metal debugger screenshots" max_height="70svh"> %}
<li>
{{ <body_image page path="xcode_debugger_shader_profiling.webp" alt="Xcode’s Metal shader profiler showing instruction costs alongside the rendered black hole." /> }}
</li>
<li>
{{ <body_image page path="xcode_debugger_shader_timeline.webp" alt="Xcode’s GPU timeline showing calculateLensing taking 2.31 milliseconds, followed by bloom and tone mapping." /> }}
</li>
{% </carousel> %}

In the second photo you can see that the `calculateLensing` phase of the shader took 2.31ms while the window was at a resolution of 3110x1952, which I think is pretty fast! The bloom and tonemapping only add 1–2ms, which means I comfortably sit within the 8.3ms budget to render at 120 frames per second.

On iPhone, I render at full ~2K resolution as of now. It looks great and frames only take about 7ms on my 15 Pro Max, but the margin is narrower than I'd like (and it's very power hungry) so I will probably adjust the resolution I use before release to find a better balance between performance and battery life.

## What’s next?
I will release Gravitation on the app store soon! After that, for a Mac version I will add an option to export videos so people can make their own physically accurate animated wallpapers or footage to use for whatever. I might also explore more integration with the SwiftUI animation system to power keyframes or camera paths. 

For the renderer, there is plenty more that can be done to improve the physical accuracy: a higher resolution background, rendering point stars, motion blur, the doppler effect, etc. They’re all very exciting prospects, but I’m not sure which ones I will decide to implement.

For now, here are some of my favorite clips from the renderer. The third one is a shot of the camera looking away from the black hole and falling straight in right up to the edge of the horizon.

I hope you enjoy them as much as I do.

{% <carousel label="Gravitation videos" class_name="video-carousel"> %}
<li><figure class="body-video"><video autoplay muted loop playsinline preload="none" width="3162" height="1976" data-src="/videos/gravitation/standard-view.webm" aria-label="Standard view of the black hole simulation"></video></figure></li>
<li><figure class="body-video"><video autoplay muted loop playsinline preload="none" width="3108" height="1942" data-src="/videos/gravitation/closeup.webm" aria-label="Close-up of the black hole simulation"></video></figure></li>
<li><figure class="body-video"><video autoplay muted loop playsinline preload="none" width="3162" height="1976" data-src="/videos/gravitation/falling-in.webm" aria-label="Camera falling into the black hole"></video></figure></li>
<li><figure class="body-video"><video autoplay muted loop playsinline preload="none" width="3098" height="2000" data-src="/videos/gravitation/galaxy.webm" aria-label="Galaxy distorted by the black hole"></video></figure></li>
{% </carousel> %}

## References

[^dneg-backgrounds]: DNEG. “Visualizing Interstellar’s Wormhole.” High-resolution longitude-latitude maps. <https://www.dneg.com/news/visualizing-interstellars-wormhole>.

[^dlmf]: Reinhardt, W. P., and P. L. Walker. “Jacobian Elliptic Functions.” NIST Digital Library of Mathematical Functions, Chapter 22. <https://dlmf.nist.gov/22>.

[^muller]: Müller, Thomas, and Jörg Frauendiener. “Interactive Visualization of a thin disc around a Schwarzschild black hole.” <https://doi.org/10.48550/arXiv.1206.4259>.

[^james]: James, Oliver, Eugenie von Tunzelmann, Paul Franklin, and Kip S. Thorne. “Gravitational Lensing by Spinning Black Holes in Astrophysics, and in the Movie Interstellar.” <https://doi.org/10.48550/arXiv.1502.03808>.

[^bruton]: Bruton, Dan. “Color Science.” <http://www.midnightkite.com/color.html>.

[^kodak]: Eastman Kodak Company. “EASTMAN EXR 50D Color Negative Film 5245™ / 7245™.” KODAK Publication No. H-1-5245, March 1999. <https://125px.com/docs/motionpicture/kodak/5245-1999.pdf>.

[^jimenez]: Jimenez, Jorge. “Next Generation Post Processing Effects.” <https://www.iryoku.com/next-generation-post-processing-in-call-of-duty-advanced-warfare/>.

/**
 * The one place GSAP is set up. Import gsap and its plugins from here, never from 'gsap' directly,
 * so each plugin is registered exactly once.
 */
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { DrawSVGPlugin } from 'gsap/DrawSVGPlugin';
import { Flip } from 'gsap/Flip';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';

gsap.registerPlugin(useGSAP, ScrollTrigger, Flip, SplitText, DrawSVGPlugin);

// A slow frame (a big list arriving, a tab regaining focus) must not make tweens jump.
gsap.ticker.lagSmoothing(500, 33);
gsap.defaults({ overwrite: 'auto' });

export { DrawSVGPlugin, Flip, gsap, ScrollTrigger, SplitText, useGSAP };

import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {StandoffProperties} from './episodes/001-standoff-properties/scene';
import episode from './episodes/001-standoff-properties/metadata.json';
import {WhenTextChanges} from './episodes/002-when-text-changes/scene';
import changes from './episodes/002-when-text-changes/metadata.json';
import {BeyondTheHierarchy} from './episodes/003-beyond-the-hierarchy/scene';
import hierarchy from './episodes/003-beyond-the-hierarchy/metadata.json';
import './theme/fonts.css';

function MutableConcepts() {
  return <>
    <Composition id={episode.id} component={StandoffProperties}
      width={episode.width} height={episode.height} fps={episode.fps}
      durationInFrames={episode.durationSeconds * episode.fps} />
    <Composition id={changes.id} component={WhenTextChanges}
      width={changes.width} height={changes.height} fps={changes.fps}
      durationInFrames={changes.durationSeconds * changes.fps} />
    <Composition id={hierarchy.id} component={BeyondTheHierarchy}
      width={hierarchy.width} height={hierarchy.height} fps={hierarchy.fps}
      durationInFrames={hierarchy.durationSeconds * hierarchy.fps} />
  </>;
}

registerRoot(MutableConcepts);

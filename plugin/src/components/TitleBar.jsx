import React, { useState, useEffect } from 'react';

// Content header below the native OS title bar: brand + live project crumbs.
export default function TitleBar() {
    const [project, setProject] = useState('--');
    const [page, setPage] = useState('--');
    const [timeline, setTimeline] = useState('--');

    useEffect(() => {
        Promise.all([
            window.resolveAPI.getProjectName(),
            window.resolveAPI.getCurrentPage(),
            window.resolveAPI.getCurrentTimeline()
        ]).then(([proj, pg, tl]) => {
            setProject(proj || '--');
            setPage(pg || '--');
            setTimeline(tl || '--');
        });
    }, []);

    return (
        <div className="titlebar">
            <div className="tb-logo" role="img" aria-label="Resolve AI" />
            <span className="tb-name">Resolve AI</span>
            <div className="tb-crumbs">
                <span className="seg">{project}</span>
                <span className="sep">/</span>
                <span className="seg">{page}</span>
                <span className="sep">/</span>
                <span className="cur">{timeline}</span>
                <span className="tb-dot" title="Connected to active timeline" />
            </div>
        </div>
    );
}

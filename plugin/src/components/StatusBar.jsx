import React, { useState, useEffect } from 'react';

export default function StatusBar() {
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
        <div id="status-bar">
            <span>{project}</span>
            <span className="sep">/</span>
            <span>{page}</span>
            <span className="sep">/</span>
            <span>{timeline}</span>
        </div>
    );
}

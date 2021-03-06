import { GameStatus, GameStatusMap } from "../generated/types_pb";
import React, { useEffect, useState } from "react";
import {
  chatBoxActiveSelector,
  gameStateSelector,
  heisterSelectedSelector,
  playerIsSpectatorSelector,
} from "./slice";

import { ConnectionStatus } from "./types";
import ConnectionStatusComponent from "./ConnectionStatusComponent";
import GameWindowComponent from "./GameWindowComponent";
import JoinGameForm from "./JoinGameForm";
import LobbyForm from "./LobbyForm";
import MessagesComponent from "./MessagesComponent";
import { connectionStatusSelector } from "./slice";
import { handleKeyInput } from "./api";
import styles from "../components/styles";
import { useDispatch } from "react-redux";
import { useSelector } from "react-redux";

type MainGameProps = {};
const MainGame = ({}: MainGameProps) => {
  const dispatch = useDispatch();

  const game_state = useSelector(gameStateSelector);
  const heister_selected_keyboard = useSelector(heisterSelectedSelector);
  const connection_status = useSelector(connectionStatusSelector);
  const player_is_spectator = useSelector(playerIsSpectatorSelector);
  const chat_box_active = useSelector(chatBoxActiveSelector);

  // Bind key listener on mount, and unbind on unmount.
  // See https://reactjs.org/docs/hooks-effect.html.
  // This still does key repeat, but it doesn't bind the event
  // listener more than once so we don't get duplicate key events.
  // So the keys behave as if you were typing into a text area;
  // key repeat kicks in after a user defined OS level delay.
  // https://stackoverflow.com/questions/41693715/react-redux-what-is-the-canonical-way-to-bind-a-keypress-action-to-kick-off-a-r
  useEffect(() => {
    // Preload images and audio.
    var tile_names = ["1a", "2", "3", "4", "5", "6", "7", "8", "9"];
    for (var i = 0; i < tile_names.length; i++) {
      const tile_name = tile_names[i];
      const img = (new Image().src = `static/images/00${tile_name}.jpg`);
      window[`preload_tile_${tile_name}`] = img;
    }
    window["preload_tile_shadow_tile"] = new Image().src =
      "static/images/tile_shadow.png";
    window["tap_audio_object"] = new Audio("static/audio/tap01-soft-wood.mp3");

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);
    return function cleanup() {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("keyup", handleKeyUp);
    };
  });

  const handleKeyDown = (event) => {
    if (player_is_spectator) {
      return;
    }
    if (chat_box_active) {
      return;
    }
    dispatch(
      handleKeyInput(
        game_state,
        connection_status,
        heister_selected_keyboard,
        event.key
      )
    );
    document.removeEventListener("keydown", handleKeyDown);
  };

  const handleKeyUp = (event) => {
    document.addEventListener("keydown", handleKeyDown, { once: true });
  };

  var inner;
  if (game_state && game_state.getGameStatus() !== GameStatus.STAGING) {
    inner = <GameWindowComponent />;
  } else {
    var inner_form;
    if (connection_status == ConnectionStatus.Connecting) {
      <p>Joining game...</p>;
    } else if (connection_status == ConnectionStatus.NotConnected) {
      inner_form = <JoinGameForm />;
      inner = (
        <div className="triangle">
          <h1 className="thtTitle">Team Heist Tactics</h1>
          <h3 className="thtSubtitle">Committing crime, together.</h3>
          {inner_form}
          <MessagesComponent />
        </div>
      );
    } else if (
      game_state &&
      game_state.getGameStatus() === GameStatus.STAGING
    ) {
      inner_form = <LobbyForm />;
      inner = (
        <div className="rect">
          {inner_form}
          <hr></hr>
          <MessagesComponent />
        </div>
      );
    }
  }

  return (
    <div>
      {inner}
      <div style={styles.connectionStatusOverlay}>
        <ConnectionStatusComponent />
      </div>
    </div>
  );
};

// <GameWindowComponent />
// TODO Get rid of GameWindowComponent from here.

export default MainGame;

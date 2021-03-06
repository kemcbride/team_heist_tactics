use crate::errors::MyError;
use crate::game::{GameHandle, GameOptions, MoveValidity};
use crate::manager::{GameManagerWrapper, GameWrapper, JoinOptions};
use crate::serializer::InternalMessage;
use crate::types::PlayerName;
use crate::utils::empty_string_as_none;

use log::{debug, info, trace, warn};
use std::fs::File;
use std::io::{BufReader, Read};

use actix::{Actor, Handler, StreamHandler};
use actix_web::{http::header, web, App, HttpRequest, HttpResponse, HttpServer, Responder};
use actix_web_actors::ws;
use serde::Deserialize;
use std::sync::{Arc, RwLock};

pub async fn index() -> impl Responder {
    let file = File::open("templates/index.html");
    let file = match file {
        Ok(body) => body,
        Err(e) => return HttpResponse::from_error(e.into()),
    };
    let mut buf_reader = BufReader::new(file);
    let mut contents = String::new();
    buf_reader
        .read_to_string(&mut contents)
        .expect("Failed to read play.html into buffer");
    HttpResponse::Ok().body(contents)
}

pub async fn play() -> impl Responder {
    let file = File::open("templates/play.html");
    let file = match file {
        Ok(body) => body,
        Err(e) => return HttpResponse::from_error(e.into()),
    };
    let mut buf_reader = BufReader::new(file);
    let mut contents = String::new();
    buf_reader
        .read_to_string(&mut contents)
        .expect("Failed to read play.html into buffer");
    HttpResponse::Ok().body(contents)
}

#[derive(Deserialize)]
pub struct CreateGameFormData {
    #[serde(deserialize_with = "empty_string_as_none")]
    game_handle: Option<String>,
}

pub async fn create_game(
    _req: HttpRequest,
    form: web::Form<CreateGameFormData>,
    game_manager_wrapper: web::Data<GameManagerWrapper>,
) -> impl Responder {
    let mut game_manager = game_manager_wrapper.game_manager.write().unwrap();

    // Register a new game.
    let game_options = GameOptions::default();
    let game_handle = game_manager.new_game(game_options, form.game_handle.clone());
    let game_handle = match game_handle {
        Ok(game_handle) => game_handle,
        Err(e) => return HttpResponse::from_error(MyError::from(e).into()),
    };

    // Get the handle to the game and return a redirect to play/handle=<that page>.
    // The frontend will use the last part of the URL to build the join_game request.
    // TODO Use proper params builder for this, like url_for.
    let location = format!("play?handle={}", game_handle.0.to_string());

    HttpResponse::SeeOther()
        .header(header::LOCATION, location)
        .finish()
}

#[derive(Deserialize)]
pub struct JoinGameQuery {
    name: String,
    handle: String,
}

// TODO Make the input here a struct and use whatever actix offers for this purpose.
// TODO This is the one that returns the websocket client connection
// TODO Check for this handle if a player with this name already exists.
//      If so, reconnect them with that player instead of making a new player + ws.
pub async fn play_game(
    req: HttpRequest,
    info: web::Query<JoinGameQuery>,
    stream: web::Payload,
    game_manager_wrapper: web::Data<GameManagerWrapper>,
) -> impl Responder {
    debug!("Player {} joining game {}", info.name, info.handle);
    let mut game_manager = game_manager_wrapper.game_manager.write().unwrap();
    let handle = GameHandle(info.handle.to_string());
    let join_options = JoinOptions {
        name: info.name.to_string(),
        handle: handle.clone(),
    };
    let game_wrapper = game_manager.join_game(join_options);
    let game_wrapper = match game_wrapper {
        Ok(game_wrapper) => game_wrapper,
        Err(e) => return HttpResponse::from_error(MyError::from(e).into()),
    };

    let my_ws = MyWs {
        game_wrapper: game_wrapper.clone(),
        player_name: PlayerName(info.name.clone()),
    };
    debug!(
        "Created actor for player {} joining game {}",
        info.name, info.handle
    );

    let res = ws::start_with_addr(my_ws, &req, stream);
    let (addr, resp) = match res {
        Ok(res) => res,
        Err(e) => return HttpResponse::from_error(e),
    };
    debug!(
        "Registering actor for player {} joining game {}",
        info.name, info.handle
    );
    game_manager.register_actor(handle, addr);
    trace!(
        "Registered actor for player {} joining game {}",
        info.name,
        info.handle
    );

    debug!(
        "Websocket for player {} in game {} upgraded successfully",
        info.name, info.handle
    );
    resp
}

#[derive(Debug)]
pub struct MyWs {
    game_wrapper: Arc<RwLock<GameWrapper>>,
    player_name: PlayerName,
}

impl Actor for MyWs {
    type Context = ws::WebsocketContext<Self>;
}

// This impl handles messages received from the client.
impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for MyWs {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        if let Ok(ws::Message::Ping(ping)) = msg {
            debug!("Ponging: {:?}", ping);
            ctx.pong(&ping);
            return;
        }
        let validity = match msg {
            Ok(ws::Message::Binary(bin)) => match InternalMessage::from_bytes(&bin.clone()) {
                Ok(internal_message) => self
                    .game_wrapper
                    .write()
                    .unwrap()
                    .handle_message(internal_message.main_message, &self.player_name),
                Err(e) => {
                    warn!("Failed to decode message: {:?}: {:?}", bin, e);
                    MoveValidity::Invalid(format!("Failed to decode message: {:?}", e))
                }
            },
            wildcard => {
                warn!("Unexpected message received: {:?}", wildcard);
                MoveValidity::Invalid("Unexpected message received".to_string())
            }
        };
        debug!("Received move that is: {:?}", validity);
        match validity {
            MoveValidity::Valid => {
                let res = self.game_wrapper.read().unwrap().push_state();
                match res {
                    Ok(_) => info!("Message was valid and pushed state to all actors successfully"),
                    Err(e) => warn!(
                        "Message was valid but failed to push state to all actors: {:?}",
                        e
                    ),
                }
            }
            MoveValidity::Invalid(reason) => {
                let response = InternalMessage::from_invalid_reason(reason);
                ctx.binary(response.to_bytes());
            }
        }
    }
}

// This impl handles messages being sent between actors internally.
impl Handler<InternalMessage> for MyWs {
    type Result = ();

    fn handle(&mut self, msg: InternalMessage, ctx: &mut Self::Context) {
        ctx.binary(msg.to_bytes());
    }
}

#[actix_rt::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| App::new().route("/ws/", web::get().to(index)))
        .bind("127.0.0.1:8088")?
        .run()
        .await
}
